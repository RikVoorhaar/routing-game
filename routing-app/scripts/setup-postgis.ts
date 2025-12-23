/**
 * Standalone script to set up PostGIS extension
 * Run this if you're having issues with PostGIS setup
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

async function setupPostGIS() {
	console.log('PostGIS Setup Script');
	console.log('--------------------');

	// Connect to database
	const client = postgres(
		process.env.DATABASE_URL ||
			'postgresql://routing_user:routing_password@localhost:5432/routing_game'
	);

	const db = drizzle(client);

	try {
		// Check if PostGIS is already installed
		console.log('Checking PostGIS installation...');
		const result = await db.execute(sql`
      SELECT 1 FROM pg_extension WHERE extname = 'postgis'
    `);

		if (result.length > 0) {
			console.log('✅ PostGIS extension is already installed');
		} else {
			console.log('Installing PostGIS extension...');
			await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
			console.log('✅ PostGIS extension installed successfully');
		}

		// Check PostGIS version
		console.log('Checking PostGIS version...');
		const versionResult = await db.execute(sql`SELECT PostGIS_Version()`);
		console.log('PostGIS version:', versionResult[0]);

		// Test spatial functionality
		console.log('Testing spatial functionality...');
		const testResult = await db.execute(sql`
      SELECT ST_AsText(ST_Point(0, 0)) as test_point
    `);
		console.log('✅ Spatial functions working correctly:', testResult[0]);

		console.log('\n🎉 PostGIS setup completed successfully!');
	} catch (error) {
		console.error('❌ Error setting up PostGIS:', error);
		console.log('\nTroubleshooting:');
		console.log('1. Make sure PostgreSQL has PostGIS installed');
		console.log('2. Check if you have the right permissions');
		console.log('3. Try running: sudo apt-get install postgresql-postgis');
		process.exit(1);
	} finally {
		await client.end();
	}
}

setupPostGIS();
