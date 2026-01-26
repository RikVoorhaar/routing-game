import { db } from '../src/lib/server/db/standalone';
import { regions } from '../src/lib/server/db/schema';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { FeatureCollection, Feature } from 'geojson';
import { sql } from 'drizzle-orm';

interface RegionProperties {
	NUTS_ID: string;
	CNTR_CODE: string;
	NAME_LATN: string;
	NUTS_NAME?: string;
	NAME_LOCAL?: string;
}

async function main() {
	console.log('Populating regions table...');
	console.log('---------------------------');

	// Load GeoJSON file
	const geojsonPath = join(process.cwd(), 'static', 'regions', 'combined_01m.geojson');
	console.log(`Reading regions from: ${geojsonPath}`);

	const geojsonContent = readFileSync(geojsonPath, 'utf-8');
	const geojson = JSON.parse(geojsonContent) as FeatureCollection;

	if (!geojson.features || !Array.isArray(geojson.features)) {
		throw new Error('Invalid GeoJSON structure: expected features array');
	}

	console.log(`Found ${geojson.features.length} regions`);

	// Insert regions
	let inserted = 0;
	let errors = 0;

	for (const feature of geojson.features) {
		try {
			const props = feature.properties as RegionProperties;
			if (!props.NUTS_ID || !props.CNTR_CODE || !props.NAME_LATN) {
				console.warn(`  ⚠ Skipping feature with missing required properties:`, props);
				errors++;
				continue;
			}

			// Convert geometry to PostGIS MultiPolygon
			// The GeoJSON CRS says 3857, and coordinates are large numbers (millions), so they're already in 3857
			// Use raw SQL for geometry insertion since Drizzle doesn't handle PostGIS types directly
			const geomJson = JSON.stringify(feature.geometry);
			await db.execute(sql`
				INSERT INTO region (code, country_code, name_latin, name_local, geom)
				VALUES (
					${props.NUTS_ID},
					${props.CNTR_CODE},
					${props.NAME_LATN},
					${props.NAME_LOCAL || props.NUTS_NAME || null},
					ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 3857)::geometry(MultiPolygon, 3857)
				)
				ON CONFLICT (code) DO UPDATE SET
					country_code = EXCLUDED.country_code,
					name_latin = EXCLUDED.name_latin,
					name_local = EXCLUDED.name_local,
					geom = EXCLUDED.geom
			`);

			inserted++;
			if (inserted % 50 === 0) {
				console.log(`  Processed ${inserted} regions...`);
			}
		} catch (error) {
			console.error(`  ✗ Error inserting region ${feature.properties?.NUTS_ID}:`, error);
			errors++;
		}
	}

	console.log('\n---------------------------');
	console.log(`Summary:`);
	console.log(`  Inserted: ${inserted}`);
	console.log(`  Errors: ${errors}`);
	console.log(`  Total features: ${geojson.features.length}`);
	console.log('Regions populated successfully!');
}

main()
	.catch((error) => {
		console.error('Error populating regions:', error);
		process.exit(1);
	})
	.finally(async () => {
		await db.$client.end();
	});
