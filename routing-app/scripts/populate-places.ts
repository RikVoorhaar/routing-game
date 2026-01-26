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
	const args = process.argv.slice(2);
	const testLimitIndex = args.indexOf('--test-limit');
	const testLimit = testLimitIndex !== -1 ? parseInt(args[testLimitIndex + 1]) : null;

	console.log('Populating places table...');
	console.log('--------------------------');
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

	console.log('\nProcessing OSM tables...');
	console.log('--------------------------');

	// Process each OSM table
	const tables = [
		{ name: 'planet_osm_point', originTable: 'point', geomFunc: 'geom' }, // Points: use as-is
		{ name: 'planet_osm_line', originTable: 'line', geomFunc: 'ST_Centroid(geom)' }, // Lines: use centroid
		{ name: 'planet_osm_polygon', originTable: 'polygon', geomFunc: 'ST_PointOnSurface(geom)' }, // Polygons: use point on surface
		{ name: 'planet_osm_rels', originTable: 'rel', geomFunc: 'ST_PointOnSurface(geom)' } // Relations: use point on surface
	];

	let totalInserted = 0;

	for (const table of tables) {
		console.log(`\nProcessing ${table.name}...`);

		const limitClause = testLimit ? `LIMIT ${testLimit}` : '';

		// Insert places from this OSM table
		// We do this in two passes for efficiency:
		// 1. First filter by category (cheap JSONB operations)
		// 2. Then do expensive spatial join only on matching features
		// Note: geomFunc references osm.geom, so we need to prefix it
		const geomExpr = table.geomFunc === 'geom' 
			? 'osm.geom' 
			: table.geomFunc.replace('geom', 'osm.geom');
		
		const insertQuery = `
			INSERT INTO places (origin_table, origin_id, category_id, region_id, geom)
			WITH categorized AS (
				SELECT 
					osm.osm_id,
					${categoryCaseSql}::integer AS category_id,
					${geomExpr}::geometry(Point, 3857) AS geom
				FROM ${table.name} osm
				WHERE ${categoryCaseSql}::integer IS NOT NULL
				${limitClause}
			)
			SELECT 
				'${table.originTable}'::origin_table,
				categorized.osm_id,
				categorized.category_id,
				r.id AS region_id,
				categorized.geom
			FROM categorized
			LEFT JOIN region r ON ST_Within(categorized.geom, r.geom)
			WHERE r.id IS NOT NULL
			ON CONFLICT (origin_table, origin_id) DO NOTHING
		`;

		const insertSql = sql.raw(insertQuery);

		try {
			const result = await db.execute(insertSql);
			const inserted = (result as any).rowCount || 0;
			totalInserted += inserted;
			console.log(`  ✓ Inserted ${inserted} places from ${table.name}`);
		} catch (error) {
			console.error(`  ✗ Error processing ${table.name}:`, error);
			throw error;
		}
	}

	console.log('\n--------------------------');
	console.log(`Summary:`);
	console.log(`  Total places inserted: ${totalInserted}`);
	if (testLimit) {
		console.log(`  (Test mode with LIMIT ${testLimit})`);
	}
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
