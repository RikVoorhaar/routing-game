// Don't directly import from the db module which uses SvelteKit-specific imports
// import { db } from '../src/lib/server/db';
import * as schema from '../src/lib/server/db/schema';
import { hashPassword } from '../src/lib/server/auth/password';
import { nanoid } from 'nanoid';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { createInterface } from 'node:readline';
import { eq } from 'drizzle-orm';
import { spawn } from 'node:child_process';
import process from 'node:process';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const forceFlag = args.includes('--force');

// Function to ask a question and get user input
function askQuestion(query: string): Promise<string> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout
	});

	return new Promise((resolve) =>
		rl.question(query, (answer) => {
			rl.close();
			resolve(answer);
		})
	);
}

// Get existing tables using PostgreSQL information_schema
async function getExistingTables(client: ReturnType<typeof postgres>): Promise<string[]> {
	try {
		const result = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;
		return result.map((row) => row.table_name as string);
	} catch (error) {
		console.error('Error checking database state:', error);
		return [];
	}
}

// Drop all tables using ORM
async function dropAllTables(
	db: ReturnType<typeof drizzle>,
	existingTables: string[]
): Promise<void> {
	// Drop all tables that aren't PostGIS system tables
	for (const tableName of existingTables) {
		if (tableName !== 'spatial_ref_sys') {
			try {
				await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
				console.log(`Dropped table: ${tableName}`);
			} catch (error) {
				console.error(`Error dropping table ${tableName}:`, error);
			}
		}
	}
}

// Run drizzle-kit migrate to apply migrations
async function runDrizzleKitMigrate(): Promise<void> {
	return new Promise((resolve, reject) => {
		// Apply migrations using drizzle-kit migrate
		const migrateProcess = spawn('npx', ['drizzle-kit', 'migrate'], {
			stdio: 'inherit'
		});

		migrateProcess.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`drizzle-kit migrate failed with exit code ${code}`));
			}
		});

		migrateProcess.on('error', (error) => {
			reject(error);
		});

		// Timeout after 90 seconds
		setTimeout(() => {
			migrateProcess.kill('SIGTERM');
			reject(new Error('drizzle-kit migrate timed out'));
		}, 90000);
	});
}

async function main() {
	console.log('Database Initialization Script');
	console.log('------------------------------');

	// Connect to database
	const client = postgres(
		process.env.DATABASE_URL ||
			'postgresql://routing_user:routing_password@localhost:5432/routing_game'
	);

	// Create database connection with the schema for potential table operations
	const db = drizzle(client, { schema });

	// Check if database already has tables
	const existingTables = await getExistingTables(client);
	console.log('Existing tables in database:', existingTables.join(', '));

	if (existingTables.length > 0) {
		console.log('Database already contains tables.');

		let choice = '1';
		if (!forceFlag) {
			const answer = await askQuestion(
				'What would you like to do?\n' +
					'1. Keep existing database (default)\n' +
					'2. Drop all tables and reinitialize\n' +
					'Enter your choice (1/2): '
			);
			choice = answer.trim() || '1';
		} else {
			console.log('--force flag detected, automatically choosing to drop and reinitialize');
			choice = '2';
		}

		if (choice !== '2') {
			console.log('Keeping existing database. Exiting...');
			await client.end();
			process.exit(0);
		}

		// User chose to drop tables
		console.log('Dropping existing tables...');

		if (!forceFlag) {
			const confirmation = await askQuestion(
				'Are you sure you want to drop these tables? This action cannot be undone (y/N): '
			);

			if (confirmation.toLowerCase() !== 'y' && confirmation.toLowerCase() !== 'yes') {
				console.log('Operation cancelled. Exiting...');
				await client.end();
				process.exit(0);
			}
		} else {
			console.log('--force flag detected, skipping confirmation');
		}

		try {
			await dropAllTables(db, existingTables);
			console.log('All tables dropped successfully.');
		} catch (error) {
			console.error('Error dropping tables:', error);
			await client.end();
			process.exit(1);
		}
	} else {
		console.log('No existing tables found. Will initialize new database.');
	}

	try {
		// Set up PostGIS extension first (from schema)
		await schema.setupPostGIS(db);

		// Apply migrations using drizzle-kit migrate
		console.log('Applying migrations using drizzle-kit migrate...');
		await runDrizzleKitMigrate();
		console.log('Migrations applied successfully');

		// Create PostGIS spatial indexes (from schema)
		await schema.createSpatialIndexes(db);

		// Check if test user already exists
		const userExists = await db
			.select()
			.from(schema.users)
			.where(eq(schema.users.username, 'testuser'));

		if (userExists.length > 0) {
			console.log('Test user already exists, skipping user creation.');
		} else {
			// Create test user
			console.log('Creating test user...');
			const testUserId = nanoid();
			const hashedPassword = await hashPassword('password123');

			// Insert test user
			await db.insert(schema.users).values({
				id: testUserId,
				username: 'testuser',
				name: 'Test User',
				email: 'test@example.com'
			});

			// Insert test user credentials
			await db.insert(schema.credentials).values({
				id: nanoid(),
				userId: testUserId,
				hashedPassword
			});

			console.log('Test user created with:');
			console.log('- Username: testuser');
			console.log('- Password: password123');
			console.log('- User ID:', testUserId);
		}

		console.log('Database initialized successfully!');
	} catch (error) {
		console.error('Error initializing database:', error);
		await client.end();
		process.exit(1);
	}

	await client.end();
	process.exit(0);
}

main();
