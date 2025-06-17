import {
	integer,
	primaryKey,
	pgTable,
	text,
	numeric,
	timestamp,
	boolean,
	jsonb,
	index,
	serial,
	varchar,
  } from 'drizzle-orm/pg-core';
  import { sql } from 'drizzle-orm';
  
  // Users table - core user data
  export const users = pgTable('user', {
	id: text('id').notNull().primaryKey(),
	name: text('name'),
	email: text('email').unique(),
	emailVerified: timestamp('email_verified', { withTimezone: true }),
	image: text('image'),
	// Optional user-specific fields (not part of Auth.js schema)
	username: text('username').unique(),
	cheatsEnabled: boolean('cheats_enabled').notNull().default(false),
  });
  
  // Addresses table - stores geographic addresses with PostGIS geometry
  export const addresses = pgTable('address', {
	id: varchar('id').notNull().primaryKey(),
	street: varchar('street'),
	houseNumber: varchar('house_number'),
	postcode: varchar('postcode'),
	city: varchar('city'),
	// PostGIS geometry column for efficient spatial queries
	location: text('location').notNull(), // POINT geometry as text (handled by PostGIS)
	lat: numeric('lat').notNull(),
	lon: numeric('lon').notNull(),
	createdAt: timestamp('created_at', { withTimezone: false })
	  .notNull()
	  .default(sql`CURRENT_TIMESTAMP`),
  }, (table) => [
	// Create a spatial index on the geometry column for efficient spatial queries
	index('addresses_location_idx').on(sql`${table.location}`),
	index('addresses_city_idx').on(table.city),
	index('addresses_postcode_idx').on(table.postcode),
  ]);
  
  // Game state table - tracks user's game progress
  export const gameStates = pgTable('game_state', {
	id: text('id').notNull().primaryKey(),
	name: text('name').notNull(),
	userId: text('user_id')
	  .notNull()
	  .references(() => users.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true })
	  .notNull()
	  .default(sql`CURRENT_TIMESTAMP`),
	money: numeric('money').notNull().default('0'),
	routeLevel: integer('route_level').notNull().default(3),
  });
  
  // Employees table - tracks user's employees and their states
  export const employees = pgTable('employee', {
	id: text('id').notNull().primaryKey(),
	gameId: text('game_id')
	  .notNull()
	  .references(() => gameStates.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	upgradeState: jsonb('upgrade_state').notNull(), // JSONB: { vehicleType: string, capacity: number }
	location: jsonb('location'), // JSONB: Address | null
	availableRoutes: jsonb('available_routes').notNull().default('[]'), // JSONB: string[] (route IDs)
	timeRoutesGenerated: timestamp('time_routes_generated', { withTimezone: true }), // null if no routes generated
	currentRoute: text('current_route').references(() => routes.id), // null if not on a route
	speedMultiplier: numeric('speed_multiplier').notNull().default('1.0'),
	maxSpeed: numeric('max_speed').notNull().default('20'),
  });
  
  // Routes table - available and active routes
  export const routes = pgTable('route', {
	id: text('id').notNull().primaryKey(),
	startLocation: jsonb('start_location').notNull(), // JSONB: Address
	endLocation: jsonb('end_location').notNull(), // JSONB: Address
	lengthTime: numeric('length_time').notNull(), // in seconds (can be floating point)
	startTime: timestamp('start_time', { withTimezone: true }), // null if not started
	endTime: timestamp('end_time', { withTimezone: true }), // null if not completed
	goodsType: text('goods_type').notNull(),
	weight: numeric('weight').notNull(),
	reward: numeric('reward').notNull(),
	routeData: jsonb('route_data').notNull(), // JSONB: Route data
  });
  
  // Jobs table - generated jobs for the job market with spatial indexing
  export const jobs = pgTable('job', {
	id: serial('id').primaryKey(), // Auto-increment key
	lat: numeric('lat').notNull(), // Latitude for spatial queries
	lon: numeric('lon').notNull(), // Longitude for spatial queries
	startAddressId: varchar('start_address_id')
	  .notNull()
	  .references(() => addresses.id, { onDelete: 'cascade' }),
	endAddressId: varchar('end_address_id')
	  .notNull()
	  .references(() => addresses.id, { onDelete: 'cascade' }),
	routeId: text('route_id')
	  .notNull()
	  .references(() => routes.id, { onDelete: 'cascade' }),
	jobTier: integer('job_tier').notNull(),
	jobCategory: integer('job_category').notNull(), // Refers to JobCategory enum
	totalDistanceKm: numeric('total_distance_km').notNull(),
	totalTimeSeconds: numeric('total_time_seconds').notNull(),
	timeGenerated: timestamp('time_generated', { withTimezone: true })
	  .notNull()
	  .default(sql`CURRENT_TIMESTAMP`),
	approximateValue: numeric('approximate_value').notNull(),
  }, (table) => [
	// Regular indexes
	index('jobs_tier_idx').on(table.jobTier),
	index('jobs_category_idx').on(table.jobCategory),
	index('jobs_value_idx').on(table.approximateValue), // For sorting by value
	index('jobs_time_generated_idx').on(table.timeGenerated),
	// Note: Spatial index will be created with raw SQL since Drizzle doesn't support PostGIS
  ]);
  
  // Accounts table - OAuth providers info
  export const accounts = pgTable(
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
  export const verificationTokens = pgTable(
	'verification_token',
	{
	  identifier: text('identifier').notNull(),
	  token: text('token').notNull(),
	  expires: timestamp('expires', { withTimezone: true }).notNull(),
	},
	(vt) => [
	  primaryKey({ columns: [vt.identifier, vt.token] })
	]
  );
  
  // Credentials table - for storing password credentials separately
  export const credentials = pgTable('credential', {
	id: text('id').notNull().primaryKey(),
	userId: text('user_id')
	  .notNull()
	  .references(() => users.id, { onDelete: 'cascade' })
	  .unique(), // One credential set per user
	hashedPassword: text('hashed_password').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true })
	  .notNull()
	  .default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp('updated_at', { withTimezone: true })
	  .notNull()
	  .default(sql`CURRENT_TIMESTAMP`),
  }); 