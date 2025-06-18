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
  
  // Routes table - pure route data without timing/employee associations
  export const routes = pgTable('route', {
	id: text('id').notNull().primaryKey(),
	startAddressId: varchar('start_address_id')
	  .notNull()
	  .references(() => addresses.id, { onDelete: 'cascade' }),
	endAddressId: varchar('end_address_id')
	  .notNull()
	  .references(() => addresses.id, { onDelete: 'cascade' }),
	lengthTime: numeric('length_time').notNull(), // in seconds (can be floating point)
	goodsType: text('goods_type').notNull(),
	weight: numeric('weight').notNull(),
	reward: numeric('reward').notNull(),
	routeData: jsonb('route_data').notNull(), // JSONB: Route data
  }, (table) => [
	index('routes_start_address_idx').on(table.startAddressId),
	index('routes_end_address_idx').on(table.endAddressId),
	index('routes_goods_type_idx').on(table.goodsType),
  ]);
  
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
	speedMultiplier: numeric('speed_multiplier').notNull().default('1.0'),
	maxSpeed: numeric('max_speed').notNull().default('20'),
  });
  
  // Jobs table - generated jobs for the job market with spatial indexing
  export const jobs = pgTable('job', {
	id: serial('id').primaryKey(), // Auto-increment key
	// PostGIS geometry column for efficient spatial queries
	location: text('location').notNull(), // POINT geometry as text (handled by PostGIS)
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
	// Create a spatial index on the geometry column for efficient spatial queries
	index('jobs_location_idx').on(sql`${table.location}`),
  ]);

  // Active jobs table - tracks employees actively working on jobs
  export const activeJobs = pgTable('active_job', {
	id: text('id').notNull().primaryKey(),
	employeeId: text('employee_id')
	  .notNull()
	  .references(() => employees.id, { onDelete: 'cascade' }),
	jobId: integer('job_id')
	  .references(() => jobs.id, { onDelete: 'cascade' }), // null for employee-generated routes
	// Route to get to the job start location (null if employee is already at job start)
	routeToJobId: text('route_to_job_id')
	  .references(() => routes.id, { onDelete: 'cascade' }),
	// The actual job route
	jobRouteId: text('job_route_id')
	  .notNull()
	  .references(() => routes.id, { onDelete: 'cascade' }),
	startTime: timestamp('start_time', { withTimezone: true })
	  .notNull()
	  .default(sql`CURRENT_TIMESTAMP`),
	endTime: timestamp('end_time', { withTimezone: true }), // null if not completed
	// Modified route data with employee speed/modifiers applied
	modifiedRouteToJobData: jsonb('modified_route_to_job_data'), // null if no route to job
	modifiedJobRouteData: jsonb('modified_job_route_data').notNull(),
	// Current phase: 'traveling_to_job' or 'on_job'
	currentPhase: text('current_phase').notNull().default('traveling_to_job'), // 'traveling_to_job' | 'on_job'
	// Time when the job phase started (for tracking progress within each phase)
	jobPhaseStartTime: timestamp('job_phase_start_time', { withTimezone: true }),
  }, (table) => [
	index('active_jobs_employee_idx').on(table.employeeId),
	index('active_jobs_job_idx').on(table.jobId),
	index('active_jobs_start_time_idx').on(table.startTime),
	index('active_jobs_current_phase_idx').on(table.currentPhase),
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