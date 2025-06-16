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
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import process from 'node:process';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const execPromise = promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const forceFlag = args.includes('--force');

// Function to ask a question and get user input
function askQuestion(query: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

// Get all table objects from the schema
function getTableNames(): string[] {
  // Extract tables from schema
  const tables: string[] = [];
  
  // Check each exported member of schema
  for (const key in schema) {
    const value = schema[key];
    // Check if it's a table object
    if (
      value && 
      typeof value === 'object' && 
      'name' in value && 
      typeof value.name === 'string'
    ) {
      tables.push(value.name);
    }
  }
  
  return tables;
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
    return result.map(row => row.table_name as string);
  } catch (error) {
    console.error('Error checking database state:', error);
    return [];
  }
}

// Drop all tables using ORM
async function dropAllTables(db: ReturnType<typeof drizzle>, existingTables: string[]): Promise<void> {
  // Order tables for dropping to avoid foreign key constraints
  const orderedTables = [
    'verification_token',
    'account', 
    'credential',
    'route',
    'employee',
    'game_state',
    'user'
  ];

  for (const tableName of orderedTables) {
    if (existingTables.includes(tableName)) {
      try {
        // Use raw SQL for DROP TABLE since drizzle doesn't have a direct API for this
        await db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
        console.log(`Dropped table: ${tableName}`);
      } catch (error) {
        console.error(`Error dropping table ${tableName}:`, error);
      }
    }
  }
}

async function main() {
  console.log('Database Initialization Script');
  console.log('------------------------------');
  
  // Connect to database
  const client = postgres(
    process.env.DATABASE_URL || 'postgresql://routing_user:routing_password@localhost:5432/routing_game'
  );
  
  // Create database connection with the schema for potential table operations
  const db = drizzle(client, { schema });
  
  // Get expected table names from the schema
  const expectedTables = getTableNames();
  console.log('Tables defined in schema:', expectedTables.join(', '));
  
  // Check if database already has tables
  const existingTables = await getExistingTables(client);
  console.log('Existing tables in database:', existingTables.join(', '));
  
  if (existingTables.length > 0) {
    console.log('Database already contains tables.');
    
    let choice = '1';
    if (!forceFlag) {
      // Ask user what to do
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
    
    // Skip confirmation if --force flag is present
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
    // Use drizzle-kit push to create schema from TypeScript schema
    console.log('Creating schema using drizzle-kit push...');
    
    try {
      // Adding --force flag to skip confirmation prompts
      const { stdout, stderr } = await execPromise('npx drizzle-kit push --force');
      
      if (stderr && !stderr.includes('Warning')) {
        console.error('drizzle-kit push stderr:', stderr);
      }
      
      if (stdout) {
        console.log('drizzle-kit push output:');
        // Only show the most relevant parts of the output
        const relevantOutput = stdout
          .split('\n')
          .filter(line => 
            !line.includes('Reading config') && 
            !line.includes('No config path') &&
            !line.includes('Pulling schema')
          )
          .join('\n');
        console.log(relevantOutput);
      }
      
      console.log('Schema created successfully');
    } catch (error) {
      console.error('Error during drizzle-kit push:', error);
      
      // Try a more aggressive approach - drop everything and try again
      console.log('Attempting to fix by clearing database completely...');
      
      try {
        // Get all tables and drop them
        const remainingTables = await getExistingTables(client);
        
        // Drop all remaining tables
        await dropAllTables(db, remainingTables);
        
        // Try push again
        await execPromise('npx drizzle-kit push --force');
        console.log('Schema recreated successfully after database reset');
      } catch (secondError) {
        console.error('Failed to recover from error:', secondError);
        await client.end();
        process.exit(1);
      }
    }
    
    // Check if test user already exists
    const userExists = await db.select().from(schema.users).where(eq(schema.users.username, 'testuser'));
    
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