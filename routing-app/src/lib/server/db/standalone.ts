import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import { PinoDrizzleLogger } from '../logging/drizzleLogger.js';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env for standalone scripts (if not already loaded)
// Try to load from routing-app/.env (where this file is)
if (!process.env.DATABASE_URL && !process.env.ROUTING_SERVER_URL) {
	const envPath = resolve(process.cwd(), '.env');
	dotenv.config({ path: envPath });
}

// For standalone scripts, use environment variables directly
const DATABASE_URL =
	process.env.DATABASE_URL ||
	'postgresql://routing_user:routing_password@localhost:5432/routing_game';

const client = postgres(DATABASE_URL);

export const db = drizzle(client, {
	schema,
	logger: new PinoDrizzleLogger()
});
export { client };
