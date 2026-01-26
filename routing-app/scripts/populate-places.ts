import { db } from '../src/lib/server/db/standalone';
import { categories } from '../src/lib/server/db/schema';
import { load } from 'js-yaml';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sql, eq } from 'drizzle-orm';

interface CategoryYaml {
	categories: Array<{
		name: string;
		max_per_region?: number;
		tags: string[];
	}>;
}

interface TagRule {
	key: string;
	value: string; // '*' means any value
}

function parseTagRule(tagStr: string): TagRule {
	const [key, value] = tagStr.split('=');
	if (!key || !value) {
		throw new Error(`Invalid tag format: ${tagStr}`);
	}
	return { key, value };
}

function generateCategoryCaseStatement(
	categoryId: number,
	tagRules: TagRule[],
	tableAlias: string = 'osm'
): string {
	const conditions: string[] = [];

	for (const rule of tagRules) {
		if (rule.value === '*') {
			// Match any value for this key
			conditions.push(`${tableAlias}.tags ? '${rule.key}'`);
		} else {
			// Exact match - escape single quotes in value
			const escapedValue = rule.value.replace(/'/g, "''");
			conditions.push(
				`${tableAlias}.tags ? '${rule.key}' AND ${tableAlias}.tags->>'${rule.key}' = '${escapedValue}'`
			);
		}
	}

	if (conditions.length === 0) {
		return '';
	}

	return `WHEN ${conditions.join(' OR ')} THEN ${categoryId}`;
}

async function main() {
	const scriptStartTime = Date.now();
	
	const args = process.argv.slice(2);
	const testLimitIndex = args.indexOf('--test-limit');
	const testLimit = testLimitIndex !== -1 ? parseInt(args[testLimitIndex + 1]) : null;
	const shouldTruncate = args.includes('--truncate');

	console.log('Populating places table...');
	console.log('--------------------------');
	if (shouldTruncate) {
		console.log('⚠️  TRUNCATE mode: Will clear places table before processing');
	}
	if (testLimit) {
		console.log(`Test mode: LIMIT ${testLimit}`);
	}

	// Load categories from database
	console.log('Loading categories from database...');
	const dbCategories = await db.select().from(categories);
	const categoryMap = new Map<string, number>();
	for (const cat of dbCategories) {
		categoryMap.set(cat.name, cat.id);
	}
	console.log(`Found ${dbCategories.length} categories in database`);

	// Load YAML file
	const configPath = join(process.cwd(), 'config', 'place_categories.yaml');
	console.log(`Reading category rules from: ${configPath}`);
	const yamlContent = readFileSync(configPath, 'utf-8');
	const config = load(yamlContent) as CategoryYaml;

	if (!config.categories || !Array.isArray(config.categories)) {
		throw new Error('Invalid YAML structure: expected categories array');
	}

	// Build category CASE statement
	const caseParts: string[] = [];
	for (const category of config.categories) {
		const categoryId = categoryMap.get(category.name);
		if (!categoryId) {
			console.warn(`  ⚠ Category "${category.name}" not found in database, skipping`);
			continue;
		}

		const tagRules = category.tags.map(parseTagRule);
		const casePart = generateCategoryCaseStatement(categoryId, tagRules, 'osm');
		if (casePart) {
			caseParts.push(casePart);
		}
	}

	if (caseParts.length === 0) {
		throw new Error('No valid category rules found');
	}

	const categoryCaseSql = `CASE ${caseParts.join(' ')} ELSE NULL END`;

	// Truncate places table if requested
	if (shouldTruncate) {
		console.log('\nTruncating places table...');
		await db.execute(sql`TRUNCATE TABLE places CASCADE`);
		console.log('  ✓ Places table truncated');
	}

	console.log('\nProcessing OSM tables...');
	console.log('--------------------------');

	// Check if OSM tables exist (with europe_ prefix)
	const tablesToCheck = ['europe_planet_osm_point', 'europe_planet_osm_line', 'europe_planet_osm_polygon', 'europe_planet_osm_rels'];
	const existingTables = await db.execute(sql`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		AND table_name IN (${sql.join(tablesToCheck.map(t => sql`${t}`), sql`, `)})
	`);

	if (existingTables.length === 0) {
		throw new Error(
			'OSM tables not found. Please import OSM data first using osm2pgsql.\n' +
			'Expected tables: europe_planet_osm_point, europe_planet_osm_line, europe_planet_osm_polygon, europe_planet_osm_rels'
		);
	}

	const existingTableNames = existingTables.map((t: any) => t.table_name);
	console.log(`Found ${existingTableNames.length} OSM tables: ${existingTableNames.join(', ')}`);

	// Process each OSM table
	// Note: osm2pgsql uses different ID column names:
	// - node_id for point tables
	// - way_id for line tables
	// - area_id for polygon tables (areas are ways that form polygons)
	// - relation_id for relation tables
	const tables = [
		{ name: 'europe_planet_osm_point', originTable: 'point', osmIdColumn: 'node_id', geomFunc: 'geom' }, // Points: use as-is
		{ name: 'europe_planet_osm_line', originTable: 'line', osmIdColumn: 'way_id', geomFunc: 'ST_Centroid(geom)' }, // Lines: use centroid
		{ name: 'europe_planet_osm_polygon', originTable: 'polygon', osmIdColumn: 'area_id', geomFunc: 'ST_PointOnSurface(geom)' }, // Polygons: use point on surface
		{ name: 'europe_planet_osm_rels', originTable: 'rel', osmIdColumn: 'relation_id', geomFunc: 'ST_PointOnSurface(geom)' } // Relations: use point on surface
	].filter(t => existingTableNames.includes(t.name));

	// Get initial count
	const initialCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM places`);
	const initialCount = parseInt((initialCountResult[0] as any).count);
	let totalInserted = 0;

	// STAGE 1: Insert places with category_id but WITHOUT region_id
	// LIMIT applies to rows FROM THE ORIGIN TABLE, not inserted rows
	const stage1StartTime = Date.now();
	console.log('\n=== STAGE 1: Inserting places with categories (no region) ===');
	
	for (const table of tables) {
		const tableStartTime = Date.now();
		console.log(`\nProcessing ${table.name}...`);

		// Get count before processing this table
		const beforeCountResult = await db.execute(sql`
			SELECT COUNT(*) as count 
			FROM places 
			WHERE origin_table = ${table.originTable}::origin_table
		`);
		const beforeCount = parseInt((beforeCountResult[0] as any).count);

		// Insert places from this OSM table
		// LIMIT applies to the source table rows, not the categorized results
		// Note: geomFunc references osm.geom, so we need to prefix it
		const geomExpr = table.geomFunc === 'geom' 
			? 'osm.geom' 
			: table.geomFunc.replace('geom', 'osm.geom');
		
		// Generate deterministic ID from origin_table and origin_id
		// Use a hash-like approach: encode origin_table as a number and combine with origin_id
		// origin_table enum values: point=1, line=2, polygon=3, rel=4 (approximate)
		// We'll use a simple formula: (table_type_offset * 1e15) + origin_id
		const tableTypeOffset: Record<string, number> = {
			point: 1,
			line: 2,
			polygon: 3,
			rel: 4
		};
		const offset = tableTypeOffset[table.originTable] * 1000000000000000; // 1e15
		
		// LIMIT on the source table - process 10k rows FROM THE ORIGIN TABLE
		const sourceLimitClause = testLimit ? `LIMIT ${testLimit}` : '';
		
		// Replace 'osm.' with 'source.' in the category CASE statement and geom expression
		// since we're using 'source' as the alias in the categorized CTE
		const categoryCaseSqlForSource = categoryCaseSql.replace(/\bosm\./g, 'source.');
		const geomExprForSource = geomExpr.replace(/\bosm\./g, 'source.');
		
		const insertQuery = `
			INSERT INTO places (id, origin_table, origin_id, category_id, region_id, geom)
			WITH source_rows AS (
				SELECT 
					osm.${table.osmIdColumn},
					osm.tags,
					osm.geom
				FROM ${table.name} osm
				${sourceLimitClause}
			),
			categorized AS (
				SELECT 
					source.${table.osmIdColumn},
					${categoryCaseSqlForSource}::integer AS category_id,
					${geomExprForSource} AS geom
				FROM source_rows source
				WHERE ${categoryCaseSqlForSource}::integer IS NOT NULL
			)
			SELECT 
				${offset} + categorized.${table.osmIdColumn} AS id,
				'${table.originTable}'::origin_table,
				categorized.${table.osmIdColumn},
				categorized.category_id,
				NULL AS region_id,
				categorized.geom::geometry(Point, 3857)
			FROM categorized
			ON CONFLICT (origin_table, origin_id) DO NOTHING
		`;

		const insertSql = sql.raw(insertQuery);

		try {
			await db.execute(insertSql);
			// Check actual count after insert
			const afterCountResult = await db.execute(sql`
				SELECT COUNT(*) as count 
				FROM places 
				WHERE origin_table = ${table.originTable}::origin_table
			`);
			const afterCount = parseInt((afterCountResult[0] as any).count);
			const inserted = afterCount - beforeCount;
			const tableDuration = ((Date.now() - tableStartTime) / 1000).toFixed(2);
			if (inserted > 0) {
				totalInserted += inserted;
				console.log(`  ✓ Inserted ${inserted} places from ${table.name} (${tableDuration}s)`);
			} else {
				console.log(`  - No new places from ${table.name} (may already exist or none matched categories) (${tableDuration}s)`);
			}
		} catch (error) {
			console.error(`  ✗ Error processing ${table.name}:`, error);
			throw error;
		}
	}
	
	const stage1Duration = ((Date.now() - stage1StartTime) / 1000).toFixed(2);
	console.log(`\nStage 1 completed in ${stage1Duration}s`);

	// STAGE 2: Update region_id for all places that don't have one yet
	const stage2StartTime = Date.now();
	console.log('\n=== STAGE 2: Assigning regions via spatial join ===');
	
	const beforeRegionCountResult = await db.execute(sql`
		SELECT COUNT(*) as count 
		FROM places 
		WHERE region_id IS NULL
	`);
	const beforeRegionCount = parseInt((beforeRegionCountResult[0] as any).count);
	console.log(`Places without region: ${beforeRegionCount}`);

	if (beforeRegionCount > 0) {
		console.log('Performing spatial join to assign regions...');
		
		const updateQuery = `
			UPDATE places p
			SET region_id = r.id
			FROM region r
			WHERE p.region_id IS NULL
			AND p.geom && r.geom
			AND ST_Intersects(p.geom, r.geom)
		`;

		await db.execute(sql.raw(updateQuery));
		
		const stage2Duration = ((Date.now() - stage2StartTime) / 1000).toFixed(2);
		
		const afterRegionCountResult = await db.execute(sql`
			SELECT COUNT(*) as count 
			FROM places 
			WHERE region_id IS NULL
		`);
		const afterRegionCount = parseInt((afterRegionCountResult[0] as any).count);
		const updated = beforeRegionCount - afterRegionCount;
		
		console.log(`  ✓ Updated ${updated} places with region_id`);
		console.log(`  Remaining places without region: ${afterRegionCount}`);
		console.log(`\nStage 2 completed in ${stage2Duration}s`);
	} else {
		console.log('  - All places already have regions assigned');
		console.log(`\nStage 2 completed in 0.00s`);
	}

	// Get final count
	const finalCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM places`);
	const finalCount = parseInt((finalCountResult[0] as any).count);
	const totalInsertedThisRun = finalCount - initialCount;

	const totalDuration = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
	
	console.log('\n--------------------------');
	console.log(`Summary:`);
	console.log(`  Places before: ${initialCount}`);
	console.log(`  Places after: ${finalCount}`);
	console.log(`  Total places inserted this run: ${totalInsertedThisRun}`);
	if (testLimit) {
		console.log(`  (Test mode with LIMIT ${testLimit})`);
	}
	console.log(`\nTotal execution time: ${totalDuration}s`);
	console.log('Places populated successfully!');
}

main()
	.catch((error) => {
		console.error('Error populating places:', error);
		process.exit(1);
	})
	.finally(async () => {
		await db.$client.end();
	});
