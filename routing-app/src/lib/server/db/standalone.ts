import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// For standalone scripts, use environment variables directly
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://routing_user:routing_password@localhost:5432/routing_game';

const client = postgres(DATABASE_URL);

export const db = drizzle(client, { schema });
export { client }; 