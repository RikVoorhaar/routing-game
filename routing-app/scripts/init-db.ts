// Don't directly import from the db module which uses SvelteKit-specific imports
// import { db } from '../src/lib/server/db';
import * as schema from '../src/lib/server/db/schema';
import { hashPassword } from '../src/lib/server/auth/password';
import { nanoid } from 'nanoid';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as readline from 'readline';
import { eq } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

const execPromise = promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const forceFlag = args.includes('--force');

// Function to ask a question and get user input
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
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

async function main() {
  console.log('Database Initialization Script');
  console.log('------------------------------');
  
  // Connect to database
  const client = createClient({
    url: process.env.DATABASE_URL || 'file:local.db'
  });
  
  // Create database connection with the schema for potential table operations
  const db = drizzle(client, { schema });
  
  // Get expected table names from the schema
  const expectedTables = getTableNames();
  console.log('Tables defined in schema:', expectedTables.join(', '));
  
  // Check if database already has tables
  let existingTables: string[] = [];
  try {
    // Get all existing tables from SQLite
    const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    existingTables = result.rows
      .map(row => row.name)
      .filter((name): name is string => typeof name === 'string');
    
    console.log('Existing tables in database:', existingTables.join(', '));
  } catch (error) {
    console.error('Error checking database state:', error);
    // Continue anyway - assume tables don't exist
  }
  
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
      process.exit(0);
    }
    
    // User chose to drop tables
    console.log('Dropping existing tables and indexes...');
    try {
      // First drop all indexes to avoid conflicts
      const indexesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'");
      const indexes = indexesResult.rows
        .map(row => row.name)
        .filter((name): name is string => typeof name === 'string');
      
      if (indexes.length > 0) {
        console.log('Indexes to drop:', indexes.join(', '));
        
        for (const indexName of indexes) {
          await client.execute(`DROP INDEX IF EXISTS ${indexName}`);
          console.log(`Dropped index: ${indexName}`);
        }
      }
      
      // Then drop all tables
      console.log('Tables to drop:', existingTables.join(', '));
      
      // Skip confirmation if --force flag is present
      if (!forceFlag) {
        const confirmation = await askQuestion(
          'Are you sure you want to drop these tables? This action cannot be undone (y/N): '
        );
        
        if (confirmation.toLowerCase() !== 'y' && confirmation.toLowerCase() !== 'yes') {
          console.log('Operation cancelled. Exiting...');
          process.exit(0);
        }
      } else {
        console.log('--force flag detected, skipping confirmation');
      }
      
      // Drop tables in reverse dependency order
      // This is an estimation - ideally we would parse foreign key constraints
      // For now, we'll drop verification_token, account, session, credential first, then user
      const orderedTables = [
        ...existingTables.filter(t => t !== 'user' && t !== 'sqlite_sequence'),
        'user',
        'sqlite_sequence' // Drop sequence table last if it exists
      ];
      
      for (const tableName of orderedTables) {
        await client.execute(`DROP TABLE IF EXISTS ${tableName}`);
        console.log(`Dropped table: ${tableName}`);
      }
      
      console.log('All tables and indexes dropped successfully.');
    } catch (error) {
      console.error('Error dropping tables:', error);
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
      
      // Try a more aggressive approach - drop everything and try again with our own SQL
      console.log('Attempting to fix by clearing database completely...');
      
      try {
        // Get all tables and drop them
        const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        const remainingTables = result.rows
          .map(row => row.name)
          .filter((name): name is string => typeof name === 'string');
        
        // Drop all remaining tables
        for (const tableName of remainingTables) {
          await client.execute(`DROP TABLE IF EXISTS ${tableName}`);
          console.log(`Dropped table: ${tableName}`);
        }
        
        // Try push again
        await execPromise('npx drizzle-kit push --force');
        console.log('Schema recreated successfully after database reset');
      } catch (secondError) {
        console.error('Failed to recover from error:', secondError);
        process.exit(1);
      }
    }
    
    // Check if test user already exists
    const userExists = await db.select().from(schema.user).where(eq(schema.user.username, 'testuser'));
    
    if (userExists.length > 0) {
      console.log('Test user already exists, skipping user creation.');
    } else {
      // Create test user
      console.log('Creating test user...');
      const testUserId = nanoid();
      const hashedPassword = await hashPassword('password123');
      
      // Insert test user
      await db.insert(schema.user).values({
        id: testUserId,
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com'
      });
      
      // Insert test user credentials
      await db.insert(schema.credential).values({
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
    process.exit(1);
  }
  
  process.exit(0);
}

main(); 