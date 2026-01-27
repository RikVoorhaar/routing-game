import { db } from '../src/lib/server/db/standalone';
import { categories } from '../src/lib/server/db/schema';
import { load } from 'js-yaml';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';

interface CategoryYaml {
	categories: Array<{
		name: string;
		max_per_region?: number;
		tags: string[];
	}>;
}

const DEFAULT_MAX_PER_REGION = 100;

async function main() {
	console.log('Populating active_places table...');
	console.log('----------------------------');

	// Load YAML for max_per_region per category
	const configPath = join(process.cwd(), 'config', 'place_categories.yaml');
	const yamlContent = readFileSync(configPath, 'utf-8');
	const config = load(yamlContent) as CategoryYaml;

	if (!config.categories || !Array.isArray(config.categories)) {
		throw new Error('Invalid YAML structure: expected categories array');
	}

	// Build map: category name -> max_per_region (from YAML)
	const maxPerRegionByCategory = new Map<string, number>();
	for (const cat of config.categories) {
		maxPerRegionByCategory.set(cat.name, cat.max_per_region ?? DEFAULT_MAX_PER_REGION);
	}

	// Load category name -> id from DB
	const dbCategories = await db.select().from(categories);
	const categoryIdByName = new Map<string, number>();
	for (const c of dbCategories) {
		categoryIdByName.set(c.name, c.id);
	}

	// Truncate and repopulate
	console.log('Truncating active_places...');
	await db.execute(sql`TRUNCATE TABLE active_places`);
	console.log('  ✓ Truncated');

	let totalInserted = 0;
	for (const cat of config.categories) {
		const categoryId = categoryIdByName.get(cat.name);
		if (categoryId == null) {
			console.log(`  ⚠ Category "${cat.name}" not in DB, skipping`);
			continue;
		}
		const maxPerRegion = maxPerRegionByCategory.get(cat.name) ?? DEFAULT_MAX_PER_REGION;

		const result = await db.execute(sql`
			INSERT INTO active_places (place_id, region_id, category_id, created_at)
			SELECT id, region_id, category_id, CURRENT_TIMESTAMP
			FROM (
				SELECT
					p.id,
					p.region_id,
					p.category_id,
					ROW_NUMBER() OVER (
						PARTITION BY p.category_id, p.region_id
						ORDER BY random()
					) AS rn
				FROM places AS p
				WHERE p.category_id = ${categoryId} AND p.region_id IS NOT NULL
			) AS sub
			WHERE rn <= ${maxPerRegion}
		`);

		// Postgres execute returns result; rowCount is driver-specific. Log a count for this category.
		const countResult = await db.execute(sql`
			SELECT COUNT(*) AS n FROM active_places WHERE category_id = ${categoryId}
		`);
		const n = Number((countResult[0] as { n: string })?.n ?? 0);
		totalInserted += n;
		console.log(`  ✓ ${cat.name}: inserted ${n} rows (max_per_region=${maxPerRegion})`);
	}

	console.log('----------------------------');
	console.log(`Total active_places rows: ${totalInserted}`);
	console.log('Done.');
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$client.end();
	});
