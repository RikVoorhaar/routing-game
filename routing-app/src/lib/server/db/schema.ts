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
import { JobCategory } from '../../jobs/jobCategories';
import { relations } from 'drizzle-orm';

// JSONB Type Interfaces

/**
 * @deprecated This interface is being replaced by CategoryXp in the new upgrade system
 */
export interface LevelXP {
	level: number;
	xp: number;
}

/**
 * @deprecated This interface is being replaced by CategoryXp in the new upgrade system
 */
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

/**
 * @deprecated This interface is being replaced by UpgradeEffects in the new upgrade system
 */
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

/**
 * Category XP structure - maps each job category to its XP value
 * Used in gameState.xp JSONB field
 */
export type CategoryXp = Record<JobCategory, number>;

/**
 * Upgrade effects structure - maps effect names to their current values
 * Used in gameState.upgradeEffects JSONB field
 */
export interface UpgradeEffects {
	speed?: number;
	vehicleLevelMax?: number;
	vehicleLevelMin?: number;
	employeeLevelStart?: number;
	xpMultiplier?: number;
	moneyTimeFactor?: number;
	moneyDistanceFactor?: number;
	capacity?: number;
	upgradeDiscount?: number;
	jobsPerTier?: number; // Increases number of jobs per tier (deferred; needs job system revamp)
	freeTravel?: number; // Reduces non-job travel time (deferred; needs travel model)
	roadSpeedMin?: number; // Overrides minimum road speed cap (deferred; needs speed-limit model decision)
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

// Regions table - stores NUTS region metadata
export const regions = pgTable('region', {
	code: varchar('code').notNull().primaryKey(), // NUTS region code (e.g., "ITH3", "NL36")
	countryCode: varchar('country_code', { length: 2 }).notNull(), // Country code (e.g., "IT", "NL")
	nameLatn: text('name_latn').notNull() // Latin name of the region
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
		region: varchar('region')
			.notNull()
			.references(() => regions.code, { onDelete: 'restrict' }),
		createdAt: timestamp('created_at', { withTimezone: false })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => [
		// Create a spatial index on the geometry column for efficient spatial queries
		index('addresses_location_idx').on(sql`${table.location}`),
		index('addresses_city_idx').on(table.city),
		index('addresses_postcode_idx').on(table.postcode),
		index('addresses_region_idx').on(table.region)
	]
);

// Game state table - tracks user's game progress
export const gameStates = pgTable(
	'game_state',
	{
		id: text('id').notNull().primaryKey(),
		name: text('name').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		money: doublePrecision('money').notNull().default(0),
		xp: jsonb('xp')
			.$type<CategoryXp>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		upgradesPurchased: text('upgrades_purchased')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		upgradeEffects: jsonb('upgrade_effects')
			.$type<UpgradeEffects>()
			.notNull()
			.default(sql`'{}'::jsonb`)
	},
	(table) => [index('game_states_user_id_idx').on(table.userId)]
);

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

// Active jobs table
export const activeJobs = pgTable(
	'active_job',
	{
		id: text('id').notNull().primaryKey(),
		employeeId: text('employee_id')
			.notNull()
			.references(() => employees.id, { onDelete: 'cascade' }),
		jobId: integer('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		gameStateId: text('game_state_id')
			.notNull()
			.references(() => gameStates.id, { onDelete: 'cascade' }),
		startTime: timestamp('start_time', { withTimezone: true }), // computed when job is accepted
		generatedTime: timestamp('generated_time', { withTimezone: true }).default(
			sql`CURRENT_TIMESTAMP`
		),
		durationSeconds: doublePrecision('duration_seconds').notNull(),
		reward: doublePrecision('reward').notNull(),
		// Single XP value for the job (awarded to both employee XP and global category XP)
		xp: integer('xp').notNull(),
		jobCategory: integer('job_category').notNull(),
		employeeStartLocation: jsonb('employee_start_location').$type<Coordinate>().notNull(),
		jobPickupAddress: varchar('job_pickup_address')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade' }),
		jobDeliverAddress: varchar('job_deliver_address')
			.notNull()
			.references(() => addresses.id, { onDelete: 'cascade' })
	},
	(table) => [
		index('active_jobs_game_state_idx').on(table.gameStateId),
		index('active_jobs_employee_idx').on(table.employeeId),
		index('active_jobs_job_idx').on(table.jobId),
		index('active_jobs_generated_time').on(table.generatedTime),
		index('active_jobs_employee_job_idx').on(table.employeeId, table.jobId)
	]
);

// Modified route associated to an active job
export const activeRoutes = pgTable(
	'active_route',
	{
		id: text('id').notNull().primaryKey(),
		activeJobId: text('active_job_id')
			.notNull()
			.references(() => activeJobs.id, { onDelete: 'cascade' }),
		routeData: jsonb('route_data').$type<RoutingResult>().notNull() // JSONB: Route data
	},
	(table) => [index('active_routes_active_job_idx').on(table.activeJobId)]
);

// Employees table - tracks user's employees and their states
export const employees = pgTable(
	'employee',
	{
		id: text('id').notNull().primaryKey(),
		gameId: text('game_id')
			.notNull()
			.references(() => gameStates.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		vehicleLevel: integer('vehicle_level').notNull().default(0), // VehicleType enum
		xp: integer('xp').notNull().default(0), // Single XP value for employee
		location: jsonb('location').$type<Coordinate>().notNull(), // JSONB: Coordinate (lat/lon)
		order: integer('order').notNull().default(0) // Order in which employee was hired (for consistent display ordering)
	},
	(table) => [
		index('employees_game_id_idx').on(table.gameId),
		index('employees_game_id_order_idx').on(table.gameId, table.order)
	]
);

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
		approximateTimeSeconds: doublePrecision('approximate_time_seconds').notNull(),
		generatedTime: timestamp('generated_time', { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		approximateValue: doublePrecision('approximate_value').notNull()
	},
	(table) => [
		// Regular indexes
		index('jobs_tier_idx').on(table.jobTier),
		index('jobs_category_idx').on(table.jobCategory),
		index('jobs_value_idx').on(table.approximateValue), // For sorting by value
		index('jobs_generated_time_idx').on(table.generatedTime),
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

// Full employee data that includes active job with complete address information
export interface FullEmployeeData {
	employee: Employee;
	activeJob: ActiveJob | null;
	employeeStartLocation: Coordinate | null;
	jobPickupAddress: Address | null;
	jobDeliverAddress: Address | null;
	activeRoute: ActiveRoute | null;
}

export type Employee = InferSelectModel<typeof employees>;
export type Job = InferSelectModel<typeof jobs>;
export type GameState = InferSelectModel<typeof gameStates>;
export type Address = InferSelectModel<typeof addresses>;
export type Route = InferSelectModel<typeof routes>;
export type ActiveJob = InferSelectModel<typeof activeJobs>;
export type ActiveRoute = InferSelectModel<typeof activeRoutes>;
export type Region = InferSelectModel<typeof regions>;
