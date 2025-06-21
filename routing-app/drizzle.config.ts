import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema.ts',
	dbCredentials: {
		url:
			process.env.DATABASE_URL ||
			'postgresql://routing_user:routing_password@localhost:5432/routing_game'
	},
	verbose: true,
	strict: true
});
