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

async function main() {
	console.log('Populating categories table...');
	console.log('----------------------------');

	// Load YAML file
	const configPath = join(process.cwd(), 'config', 'place_categories.yaml');
	console.log(`Reading categories from: ${configPath}`);

	const yamlContent = readFileSync(configPath, 'utf-8');
	const config = load(yamlContent) as CategoryYaml;

	if (!config.categories || !Array.isArray(config.categories)) {
		throw new Error('Invalid YAML structure: expected categories array');
	}

	console.log(`Found ${config.categories.length} categories`);

	// Insert categories
	let inserted = 0;
	let skipped = 0;

	for (const category of config.categories) {
		try {
			await db
				.insert(categories)
				.values({ name: category.name })
				.onConflictDoNothing();

			// Check if it was actually inserted
			const result = await db
				.select()
				.from(categories)
				.where(sql`${categories.name} = ${category.name}`)
				.limit(1);

			if (result.length > 0) {
				inserted++;
				console.log(`  ✓ Inserted: ${category.name}`);
			} else {
				skipped++;
				console.log(`  - Skipped (already exists): ${category.name}`);
			}
		} catch (error) {
			console.error(`  ✗ Error inserting ${category.name}:`, error);
			throw error;
		}
	}

	console.log('\n----------------------------');
	console.log(`Summary:`);
	console.log(`  Inserted: ${inserted}`);
	console.log(`  Skipped (already exists): ${skipped}`);
	console.log(`  Total: ${config.categories.length}`);
	console.log('Categories populated successfully!');
}

main()
	.catch((error) => {
		console.error('Error populating categories:', error);
		process.exit(1);
	})
	.finally(async () => {
		await db.$client.end();
	});
