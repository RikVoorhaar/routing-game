import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  real,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table - core user data
export const users = sqliteTable('user', {
  id: text('id').notNull().primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('email_verified', { mode: 'timestamp_ms' }),
  image: text('image'),
  // Optional user-specific fields (not part of Auth.js schema)
  username: text('username').unique(),
});

// Game state table - tracks user's game progress
export const gameStates = sqliteTable('game_state', {
  id: text('id').notNull().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  money: real('money').notNull().default(0),
  routeLevel: integer('route_level').notNull().default(3),
});

// Employees table - tracks user's employees and their states
export const employees = sqliteTable('employee', {
  id: text('id').notNull().primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => gameStates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  upgradeState: text('upgrade_state', { mode: 'json' }).notNull(), // JSON: { vehicleType: string, capacity: number }
  location: text('location', { mode: 'json' }), // JSON: Address | null
  availableRoutes: text('available_routes', { mode: 'json' }).notNull().default('[]'), // JSON: string[] (route IDs)
  timeRoutesGenerated: integer('time_routes_generated', { mode: 'timestamp_ms' }), // null if no routes generated
  currentRoute: text('current_route').references(() => routes.id), // null if not on a route
  speedMultiplier: real('speed_multiplier').notNull().default(1.0),
});

// Routes table - available and active routes
export const routes = sqliteTable('route', {
  id: text('id').notNull().primaryKey(),
  startLocation: text('start_location', { mode: 'json' }).notNull(), // JSON: Address
  endLocation: text('end_location', { mode: 'json' }).notNull(), // JSON: Address
  lengthTime: integer('length_time').notNull(), // in seconds
  startTime: integer('start_time', { mode: 'timestamp_ms' }), // null if not started
  endTime: integer('end_time', { mode: 'timestamp_ms' }), // null if not completed
  goodsType: text('goods_type').notNull(),
  weight: real('weight').notNull(),
  reward: real('reward').notNull(),
  routeData: text('route_data', { mode: 'json' }).notNull(), // JSON: Route data
});

// Accounts table - OAuth providers info
export const accounts = sqliteTable(
  'account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] })
  ]
);

// Verification tokens - for email verification
export const verificationTokens = sqliteTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
  },
  (vt) => [
    primaryKey({ columns: [vt.identifier, vt.token] })
  ]
);

// Credentials table - for storing password credentials separately
export const credentials = sqliteTable('credential', {
  id: text('id').notNull().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(), // One credential set per user
  hashedPassword: text('hashed_password').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
}); 