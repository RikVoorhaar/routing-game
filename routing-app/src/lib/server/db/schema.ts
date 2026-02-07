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
	uniqueIndex,
	serial,
	varchar,
	bigint,
	pgEnum
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { JobCategory } from '../../jobs/jobCategories';

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

// Categories table - stores place categories
export const categories = pgTable('categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull().unique()
});

// Origin table enum for places
export const originTableEnum = pgEnum('origin_table', ['point', 'line', 'polygon', 'rel']);

// Regions table - stores NUTS region metadata with PostGIS geometry
export const regions = pgTable(
	'region',
	{
		id: serial('id').primaryKey(),
		code: text('code').notNull().unique(), // NUTS region code (e.g., "ITH3", "NL36")
		nameLatin: text('name_latin'), // Latin name of the region
		nameLocal: text('name_local'), // Local name of the region
		countryCode: text('country_code'), // Country code (e.g., "IT", "NL")
		geom: text('geom').notNull() // geometry(MultiPolygon, 3857)
	},
	(table) => [
		index('regions_country_code_idx').on(table.countryCode),
		index('regions_name_latin_idx').on(table.nameLatin)
		// Note: GIST index on geom is created in migration file
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
			.default(sql`'{}'::jsonb`),
		seed: integer('seed')
			.notNull()
			.default(sql`floor(random() * 2147483647)::integer`),
		seedGeneratedAt: timestamp('seed_generated_at', { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => [index('game_states_user_id_idx').on(table.userId)]
);

// Routes table removed - routes are no longer precomputed for jobs

// Active jobs table
export const activeJobs = pgTable(
	'active_job',
	{
		id: text('id').notNull().primaryKey(),
		employeeId: text('employee_id')
			.notNull()
			.references(() => employees.id, { onDelete: 'cascade' }),
		jobId: integer('job_id')
			.references(() => jobs.id, { onDelete: 'cascade' }), // Nullable for place-based jobs
		gameStateId: text('game_state_id')
			.notNull()
			.references(() => gameStates.id, { onDelete: 'cascade' }),
		startTime: timestamp('start_time', { withTimezone: true }), // computed when job is accepted
		generatedTime: timestamp('generated_time', { withTimezone: true }).default(
			sql`CURRENT_TIMESTAMP`
		),
		durationSeconds: doublePrecision('duration_seconds'), // null until route is computed
		reward: doublePrecision('reward').notNull(),
		// Single XP value for the job (awarded to both employee XP and global category XP)
		xp: integer('xp').notNull(),
		jobCategory: integer('job_category').notNull(),
		employeeStartLocation: jsonb('employee_start_location').$type<Coordinate>().notNull(),
		jobPickupPlaceId: bigint('job_pickup_place_id', { mode: 'number' })
			.notNull()
			.references(() => places.id, { onDelete: 'cascade' }),
		jobDeliverPlaceId: bigint('job_deliver_place_id', { mode: 'number' })
			.notNull()
			.references(() => places.id, { onDelete: 'cascade' }),
		startRegion: integer('start_region').references(() => regions.id, { onDelete: 'restrict' }),
		endRegion: integer('end_region').references(() => regions.id, { onDelete: 'restrict' })
	},
	(table) => [
		index('active_jobs_game_state_idx').on(table.gameStateId),
		index('active_jobs_employee_idx').on(table.employeeId),
		index('active_jobs_job_idx').on(table.jobId),
		index('active_jobs_generated_time').on(table.generatedTime),
		index('active_jobs_employee_job_idx').on(table.employeeId, table.jobId)
	]
);

// Travel jobs table - for employee travel to arbitrary locations
export const travelJobs = pgTable(
	'travel_job',
	{
		id: text('id').notNull().primaryKey(),
		employeeId: text('employee_id')
			.notNull()
			.references(() => employees.id, { onDelete: 'cascade' }),
		gameStateId: text('game_state_id')
			.notNull()
			.references(() => gameStates.id, { onDelete: 'cascade' }),
		destinationLocation: jsonb('destination_location').$type<Coordinate>().notNull(), // { lat, lon }
		startTime: timestamp('start_time', { withTimezone: true }),
		durationSeconds: doublePrecision('duration_seconds'),
		employeeStartLocation: jsonb('employee_start_location').$type<Coordinate>().notNull() // { lat, lon }
	},
	(table) => [
		index('travel_jobs_game_state_idx').on(table.gameStateId),
		index('travel_jobs_employee_idx').on(table.employeeId),
		index('travel_jobs_start_time_idx').on(table.startTime)
	]
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
		// Note: Stored as geometry(Point,3857) in DB, but Drizzle schema uses text for compatibility
		location: text('location').notNull(), // geometry(Point,3857) - handled by PostGIS
		startPlaceId: bigint('start_place_id', { mode: 'number' })
			.notNull()
			.references(() => places.id, { onDelete: 'cascade' }),
		endPlaceId: bigint('end_place_id', { mode: 'number' })
			.notNull()
			.references(() => places.id, { onDelete: 'cascade' }),
		jobTier: integer('job_tier').notNull(),
		jobCategory: integer('job_category').notNull(), // Refers to JobCategory enum
		totalDistanceKm: doublePrecision('total_distance_km').notNull(),
		generatedTime: timestamp('generated_time', { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => [
		// Regular indexes
		index('jobs_tier_idx').on(table.jobTier),
		index('jobs_category_idx').on(table.jobCategory),
		index('jobs_generated_time_idx').on(table.generatedTime),
		index('jobs_start_place_idx').on(table.startPlaceId) // Index for finding places without jobs
		// Note: Spatial GiST index on location is created by createSpatialIndexes() helper function
	]
);

// Places table - stores geographic places with PostGIS geometry
export const places = pgTable(
	'places',
	{
		id: bigint('id', { mode: 'number' }).notNull().primaryKey(),
		originTable: originTableEnum('origin_table').notNull(), // 'point', 'line', 'polygon', 'rel'
		originId: bigint('origin_id', { mode: 'number' }).notNull(), // OSM object ID (no FK constraint)
		categoryId: integer('category_id')
			.references(() => categories.id, { onDelete: 'cascade' }),
		regionId: integer('region_id')
			.references(() => regions.id, { onDelete: 'cascade' }),
		geom: text('geom').notNull() // geometry(Point, 3857)
	},
	(table) => [
		uniqueIndex('places_origin_unique_idx').on(table.originTable, table.originId),
		index('places_category_id_idx').on(table.categoryId),
		index('places_region_id_idx').on(table.regionId),
		index('places_category_region_idx').on(table.categoryId, table.regionId)
		// Note: GIST index on geom is created in migration file
	]
);

// Active places - derived table of place ids selected per (category, region) up to max_per_region from place_categories.yaml.
// Computed by scripts/populate-active-places.ts (e.g. daily). Use joins to places when full place data is needed.
export const activePlaces = pgTable(
	'active_places',
	{
		placeId: bigint('place_id', { mode: 'number' })
			.notNull()
			.references(() => places.id, { onDelete: 'cascade' }),
		regionId: integer('region_id')
			.notNull()
			.references(() => regions.id, { onDelete: 'cascade' }),
		categoryId: integer('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
	},
	(table) => [
		index('active_places_place_id_idx').on(table.placeId), // Critical for JOIN performance in views
		index('active_places_region_id_idx').on(table.regionId),
		index('active_places_category_id_idx').on(table.categoryId),
		index('active_places_region_category_idx').on(table.regionId, table.categoryId)
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

	// Create spatial index on jobs location column (geometry(Point,3857))
	// The location column is now a native geometry type, so we can index it directly
	await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_jobs_location_gist 
    ON job USING GIST (location)
  `);

	// Create spatial index on addresses location column (PostGIS POINT geometry)
	// Addresses still use text/EWKT format, so we keep the expression index
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
	destination: Coordinate; // Changed from Address to Coordinate - just lat/lon
}

// Full employee data that includes active job with complete address information
export interface FullEmployeeData {
	employee: Employee;
	activeJob: ActiveJob | null;
	employeeStartLocation: Coordinate | null;
	jobPickupPlace: Place | null;
	jobDeliverPlace: Place | null;
	activeRoute: RoutingResult | null; // Routes are fetched on-demand, not stored in DB
	travelJob: TravelJob | null;
}

export type Employee = InferSelectModel<typeof employees>;
export type Job = InferSelectModel<typeof jobs>;
export type GameState = InferSelectModel<typeof gameStates>;
export type ActiveJob = InferSelectModel<typeof activeJobs>;
export type TravelJob = InferSelectModel<typeof travelJobs>;
export type Region = InferSelectModel<typeof regions>;
export type Place = InferSelectModel<typeof places>;
export type ActivePlace = InferSelectModel<typeof activePlaces>;
export type Category = InferSelectModel<typeof categories>;