import { db } from './index';
import { sql } from 'drizzle-orm';

/**
 * Creates spatial indexes for PostGIS functionality
 * This must be run after table creation since Drizzle doesn't support PostGIS indexes
 */
export async function createSpatialIndexes(): Promise<void> {
	console.log('Creating spatial indexes...');

	try {
		// Create spatial index on jobs table for location column (EWKT format)
		await db.execute(sql`
            CREATE INDEX IF NOT EXISTS jobs_location_gist_idx 
            ON job USING GIST (ST_GeomFromEWKT(location))
        `);

		// Create spatial index on addresses location column (standard WKT format)
		await db.execute(sql`
            CREATE INDEX IF NOT EXISTS addresses_location_gist_idx 
            ON address USING GIST (ST_GeomFromText(location))
        `);

		console.log('Spatial indexes created successfully');
	} catch (error) {
		console.error('Error creating spatial indexes:', error);
		throw error;
	}
}

/**
 * Drops spatial indexes (useful for testing/reset)
 */
export async function dropSpatialIndexes(): Promise<void> {
	console.log('Dropping spatial indexes...');

	try {
		await db.execute(sql`DROP INDEX IF EXISTS jobs_location_gist_idx`);
		await db.execute(sql`DROP INDEX IF EXISTS addresses_location_gist_idx`);

		console.log('Spatial indexes dropped successfully');
	} catch (error) {
		console.error('Error dropping spatial indexes:', error);
		throw error;
	}
}
