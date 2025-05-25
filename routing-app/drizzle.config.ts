import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	dbCredentials: {
		url: process.env.DATABASE_URL || 'file:local.db'
	},
	verbose: true,
	strict: true
});
