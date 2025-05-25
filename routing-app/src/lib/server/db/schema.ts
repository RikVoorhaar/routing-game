import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table - core user data
export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name'),
	email: text('email').unique(),
	emailVerified: integer('email_verified', { mode: 'timestamp_ms' }),
	image: text('image'),
	// Preserve existing fields
	age: integer('age'),
	username: text('username').notNull().unique(),
	// We'll keep the existing password hash field for backward compatibility
	// But in new code we'll use the credentials table
	passwordHash: text('password_hash')
});

// Auth.js compatible session table with additional fields
export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	sessionToken: text('session_token').notNull().unique(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expires: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	// For backward compatibility, keep the old expires field too
	expiresAt: integer('expires_at_legacy', { mode: 'timestamp' })
});

// Accounts table for OAuth providers
export const account = sqliteTable(
	'account',
	{
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		provider: text('provider').notNull(),
		providerAccountId: text('provider_account_id').notNull(),
		refresh_token: text('refresh_token'),
		access_token: text('access_token'),
		expires_at: integer('expires_at'),
		token_type: text('token_type'),
		scope: text('scope'),
		id_token: text('id_token'),
		session_state: text('session_state'),
	},
	(account) => ({
		compoundKey: primaryKey({
			columns: [account.provider, account.providerAccountId],
		}),
	})
);

// Verification tokens - for email verification
export const verificationToken = sqliteTable(
	'verification_token',
	{
		identifier: text('identifier').notNull(),
		token: text('token').notNull(),
		expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
	},
	(vt) => ({
		compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
	})
);

// Credentials table - for securely storing password credentials
export const credential = sqliteTable('credential', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
		.unique(), // One credential set per user
	hashedPassword: text('hashed_password').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

// Export types for TypeScript
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type VerificationToken = typeof verificationToken.$inferSelect;
export type Credential = typeof credential.$inferSelect;
