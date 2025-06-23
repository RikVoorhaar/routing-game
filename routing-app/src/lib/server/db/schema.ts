import {
	integer,
	primaryKey,
	pgTable,
	text,
	doublePrecision,
	timestamp,
	boolean,
	jsonb,
	index,
	serial,
	varchar
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { JobCategory } from '../../jobs/jobCategories';

// JSONB Type Interfaces
export interface LevelXP {
	level: number;
	xp: number;
}

export interface CategoryLevels {
	[JobCategory.GROCERIES]: LevelXP;
	[JobCategory.PACKAGES]: LevelXP;
	[JobCategory.FOOD]: LevelXP;
	[JobCategory.FURNITURE]: LevelXP;
	[JobCategory.PEOPLE]: LevelXP;
	[JobCategory.FRAGILE_GOODS]: LevelXP;
	[JobCategory.CONSTRUCTION]: LevelXP;
	[JobCategory.LIQUIDS]: LevelXP;
	[JobCategory.TOXIC_GOODS]: LevelXP;
}

export interface UpgradeState {
	[JobCategory.GROCERIES]: number;
	[JobCategory.PACKAGES]: number;
	[JobCategory.FOOD]: number;
	[JobCategory.FURNITURE]: number;
	[JobCategory.PEOPLE]: number;
	[JobCategory.FRAGILE_GOODS]: number;
	[JobCategory.CONSTRUCTION]: number;
	[JobCategory.LIQUIDS]: number;
	[JobCategory.TOXIC_GOODS]: number;
}

// Users table - core user data
export const users = pgTable('user', {
	id: text('id').notNull().primaryKey(),
	name: text('name'),
	email: text('email').unique(),
	emailVerified: timestamp('email_verified', { withTimezone: true }),
	image: text('image'),
	// Optional user-specific fields (not part of Auth.js schema)
	username: text('username').unique(),
	cheatsEnabled: boolean('cheats_enabled').notNull().default(false)
});

// Addresses table - stores geographic addresses with PostGIS geometry
export const addresses = pgTable(
	'address',
	{
		id: varchar('id').notNull().primaryKey(),
		street: varchar('street'),
		houseNumber: varchar('house_number'),
		postcode: varchar('postcode'),
		city: varchar('city'),
		// PostGIS geometry column for efficient spatial queries
		location: text('location').notNull(), // POINT geometry as text (handled by PostGIS)
		lat: doublePrecision('lat').notNull(),
		lon: doublePrecision('lon').notNull(),
		createdAt: timestamp('created_at', { withTimezone: false })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => [
		// Create a spatial index on the geometry column for efficient spatial queries
		index('addresses_location_idx').on(sql`${table.location}`),
		index('addresses_city_idx').on(table.city),
		index('addresses_postcode_idx').on(table.postcode)
	]
);

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
	money: doublePrecision('money').notNull().default(0),
	routeLevel: integer('route_level').notNull().default(3)
});

// Routes table - pure route data without timing/employee associations
export const routes = pgTable(
	'route',
	{
		id: text('id').notNull().primaryKey(),
		startAddressId: varchar('start_address_id')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade' }),
		endAddressId: varchar('end_address_id')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade' }),
		lengthTime: doublePrecision('length_time').notNull(), // in seconds (can be floating point)
		routeData: jsonb('route_data').$type<RoutingResult>().notNull() // JSONB: Route data
	},
	(table) => [
		index('routes_start_address_idx').on(table.startAddressId),
		index('routes_end_address_idx').on(table.endAddressId)
	]
);

// Active jobs table - declaration moved here to avoid circular reference
export const activeJobs = pgTable(
	'active_job',
	{
		id: text('id').notNull().primaryKey(),
		employeeId: text('employee_id').notNull(), // Forward reference - will add constraint later
		jobId: integer('job_id'), // Will reference jobs table - will add constraint later
		// Route to get to the job start location (null if employee is already at job start)
		routeToJobId: text('route_to_job_id').references(() => routes.id, { onDelete: 'cascade' }),
		// The actual job route
		jobRouteId: text('job_route_id')
			.notNull()
			.references(() => routes.id, { onDelete: 'cascade' }),
		startTime: timestamp('start_time', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
		endTime: timestamp('end_time', { withTimezone: true }), // null if not completed
		// Modified route data with employee speed/modifiers applied
		modifiedRouteToJobData: jsonb('modified_route_to_job_data').$type<RoutingResult | null>(), // null if no route to job
		modifiedJobRouteData: jsonb('modified_job_route_data').$type<RoutingResult>().notNull(),
		// Current phase: 'traveling_to_job' or 'on_job'
		currentPhase: text('current_phase').notNull().default('traveling_to_job'), // 'traveling_to_job' | 'on_job'
		// Time when the job phase started (for tracking progress within each phase)
		jobPhaseStartTime: timestamp('job_phase_start_time', { withTimezone: true })
	},
	(table) => [
		index('active_jobs_employee_idx').on(table.employeeId),
		index('active_jobs_job_idx').on(table.jobId),
		index('active_jobs_start_time_idx').on(table.startTime),
		index('active_jobs_current_phase_idx').on(table.currentPhase)
	]
);

// Employees table - tracks user's employees and their states
export const employees = pgTable('employee', {
	id: text('id').notNull().primaryKey(),
	gameId: text('game_id')
		.notNull()
		.references(() => gameStates.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	vehicleLevel: integer('vehicle_level').notNull().default(0), // VehicleType enum
	licenseLevel: integer('license_level').notNull().default(0), // LicenseType enum
	categoryLevel: jsonb('category_level').$type<CategoryLevels>().notNull(), // JSONB: Record<JobCategory, { level: number, xp: number }>
	drivingLevel: jsonb('driving_level').$type<LevelXP>().notNull(), // JSONB: { level: number, xp: number }
	upgradeState: jsonb('upgrade_state').$type<UpgradeState>().notNull(), // JSONB: Record<JobCategory, number> (upgrade levels)
	location: jsonb('location').$type<Address | null>(), // JSONB: Address | null
	activeJobId: text('active_job_id').references(() => activeJobs.id, { onDelete: 'set null' }) // null if no active job
});

// Jobs table - generated jobs for the job market with spatial indexing
export const jobs = pgTable(
	'job',
	{
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
		totalDistanceKm: doublePrecision('total_distance_km').notNull(),
		totalTimeSeconds: doublePrecision('total_time_seconds').notNull(),
		timeGenerated: timestamp('time_generated', { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		approximateValue: doublePrecision('approximate_value').notNull()
	},
	(table) => [
		// Regular indexes
		index('jobs_tier_idx').on(table.jobTier),
		index('jobs_category_idx').on(table.jobCategory),
		index('jobs_value_idx').on(table.approximateValue), // For sorting by value
		index('jobs_time_generated_idx').on(table.timeGenerated),
		// Create a spatial index on the geometry column for efficient spatial queries
		index('jobs_location_idx').on(sql`${table.location}`)
	]
);

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
		session_state: text('session_state')
	},
	(table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]
);

// Verification tokens - for email verification
export const verificationTokens = pgTable(
	'verification_token',
	{
		identifier: text('identifier').notNull(),
		token: text('token').notNull(),
		expires: timestamp('expires', { withTimezone: true }).notNull()
	},
	(vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
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
		.default(sql`CURRENT_TIMESTAMP`)
});

// PostGIS setup functions - these need to be run after table creation
export async function setupPostGIS(db: PostgresJsDatabase<Record<string, never>>) {
	console.log('Setting up PostGIS extension...');
	await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
}

export async function createSpatialIndexes(db: PostgresJsDatabase<Record<string, never>>) {
	console.log('Creating spatial indexes...');

	// Create spatial index on jobs location column (PostGIS POINT geometry)
	await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_jobs_location_gist 
    ON job USING GIST (ST_GeomFromEWKT(location))
  `);

	// Create spatial index on addresses location column (PostGIS POINT geometry)
	await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_addresses_location_gist 
    ON address USING GIST (ST_GeomFromEWKT(location))
  `);

	console.log('Spatial indexes created successfully');
}
export interface Coordinate {
	lat: number;
	lon: number;
}

export interface PathPoint {
	coordinates: Coordinate;
	cumulative_time_seconds: number;
	cumulative_distance_meters: number;
	max_speed_kmh: number;
	is_walking_segment: boolean;
}

export interface RoutingResult {
	path: PathPoint[];
	travelTimeSeconds: number;
	totalDistanceMeters: number;
	destination: Address;
}
export type Employee = InferSelectModel<typeof employees>;
export type Job = InferSelectModel<typeof jobs>;
export type GameState = InferSelectModel<typeof gameStates>;
export type Address = InferSelectModel<typeof addresses>;
export type Route = InferSelectModel<typeof routes>;
export type ActiveJob = InferSelectModel<typeof activeJobs>;
