import { type InferSelectModel } from 'drizzle-orm';
import { addresses, jobs, routes } from '$lib/server/db/schema';
import { getRandomRouteInAnnulus, type RouteInAnnulus } from '$lib/routes/routing';
import { type Coordinate } from '$lib/server/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { db } from '$lib/server/db/standalone';
import { inArray } from 'drizzle-orm';
import { distance } from '@turf/turf';
import { JobCategory } from '$lib/jobs/jobCategories';
import { config } from '$lib/server/config';

type JobInsert = InferInsertModel<typeof jobs>;
// Constants for job generation
export const ROUTE_DISTANCES_KM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export const MAX_TIER = config.jobs.generation.maxTier;

// Category multipliers for value calculation - loaded from config
function getCategoryMultipliers(): Record<JobCategory, number> {
	const categoryKeys: Record<JobCategory, string> = {
		[JobCategory.GROCERIES]: 'GROCERIES',
		[JobCategory.PACKAGES]: 'PACKAGES',
		[JobCategory.FOOD]: 'FOOD',
		[JobCategory.FURNITURE]: 'FURNITURE',
		[JobCategory.PEOPLE]: 'PEOPLE',
		[JobCategory.FRAGILE_GOODS]: 'FRAGILE_GOODS',
		[JobCategory.CONSTRUCTION]: 'CONSTRUCTION',
		[JobCategory.LIQUIDS]: 'LIQUIDS',
		[JobCategory.TOXIC_GOODS]: 'TOXIC_GOODS'
	};

	const multipliers = {} as Record<JobCategory, number>;
	for (const [category, key] of Object.entries(categoryKeys) as [JobCategory, string][]) {
		multipliers[category] = config.jobs.categories.multipliers[key];
	}
	return multipliers;
}

const CATEGORY_MULTIPLIERS = getCategoryMultipliers();

// Minimum tier requirements for each category - loaded from config
function getCategoryMinTiers(): Record<JobCategory, number> {
	const categoryKeys: Record<JobCategory, string> = {
		[JobCategory.GROCERIES]: 'GROCERIES',
		[JobCategory.PACKAGES]: 'PACKAGES',
		[JobCategory.FOOD]: 'FOOD',
		[JobCategory.FURNITURE]: 'FURNITURE',
		[JobCategory.PEOPLE]: 'PEOPLE',
		[JobCategory.FRAGILE_GOODS]: 'FRAGILE_GOODS',
		[JobCategory.CONSTRUCTION]: 'CONSTRUCTION',
		[JobCategory.LIQUIDS]: 'LIQUIDS',
		[JobCategory.TOXIC_GOODS]: 'TOXIC_GOODS'
	};

	const minTiers = {} as Record<JobCategory, number>;
	for (const [category, key] of Object.entries(categoryKeys) as [JobCategory, string][]) {
		minTiers[category] = config.jobs.categories.minTiers[key];
	}
	return minTiers;
}

const CATEGORY_MIN_TIERS = getCategoryMinTiers();

// Value calculation constants - loaded from config
const DEFAULT_DISTANCE_FACTOR = config.jobs.value.distanceFactor;
const DEFAULT_TIME_FACTOR = config.jobs.value.timeFactor;

/**
 * Gets available job categories for a given tier
 */
export function getAvailableCategories(jobTier: number): JobCategory[] {
	const categories: JobCategory[] = [];

	for (const category of Object.values(JobCategory)) {
		if (typeof category === 'number' && CATEGORY_MIN_TIERS[category] <= jobTier) {
			categories.push(category);
		}
	}

	return categories;
}

/**
 * Computes job tier using probability formula: tier = min(maxTier, ceil(-log2(p)))
 */
export function generateJobTier(): number {
	const p = Math.random();
	const tier = Math.ceil(-Math.log2(p));
	return Math.min(config.jobs.generation.maxTier, tier);
}

/**
 * Computes job value based on tier, category, distance, and time
 */
export function computeApproximateJobValue(
	jobTier: number,
	jobCategory: JobCategory,
	totalDistanceKm: number,
	totalTimeSeconds: number,
	distanceFactor: number = DEFAULT_DISTANCE_FACTOR,
	timeFactor: number = DEFAULT_TIME_FACTOR
): number {
	const jobTierMultiplier = Math.pow(config.jobs.value.tierMultiplier, jobTier - 1);
	const categoryMultiplier = CATEGORY_MULTIPLIERS[jobCategory];

	// Random factor: usually near 1, but can be quite big (capped by randomFactorMax)
	const randomFactor = Math.max(1.0, -Math.log(1 - Math.random()));
	const cappedRandomFactor = Math.min(randomFactor, config.jobs.value.randomFactorMax);

	const totalTimeHours = totalTimeSeconds / 3600;
	const baseValue = totalDistanceKm * distanceFactor + totalTimeHours * timeFactor;

	return jobTierMultiplier * categoryMultiplier * cappedRandomFactor * baseValue;
}

/**
 * Generates a single job from a given address
 */
export async function generateJobFromAddress(
	startAddress: InferSelectModel<typeof addresses>
): Promise<boolean> {
	try {
		// Compute job tier
		const jobTier = generateJobTier();

		// Get distance range for this tier
		const minDistanceKm = ROUTE_DISTANCES_KM[jobTier - 1] || 0.1;
		const maxDistanceKm =
			ROUTE_DISTANCES_KM[jobTier] || ROUTE_DISTANCES_KM[ROUTE_DISTANCES_KM.length - 1];

		// Generate route within the specified annulus
		const startLocation: Coordinate = {
			lat: Number(startAddress.lat),
			lon: Number(startAddress.lon)
		};

		const routeInAnnulus: RouteInAnnulus = await getRandomRouteInAnnulus(
			startLocation,
			minDistanceKm,
			maxDistanceKm
		);
		const routeResult = routeInAnnulus.route;
		const endAddress = routeInAnnulus.destination;

		// Get available categories for this tier
		const availableCategories = getAvailableCategories(jobTier);

		if (availableCategories.length === 0) {
			return false; // No available categories for this tier
		}

		// Randomly select a category
		const jobCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];

		// Calculate total distance and time
		const totalDistanceKm = routeResult.totalDistanceMeters / 1000;
		const approximateTimeSeconds = routeResult.travelTimeSeconds;

		// Validate travel time - if it's 0 or invalid, skip this job
		if (!approximateTimeSeconds || approximateTimeSeconds <= 0) {
			console.warn(
				`Invalid travel time for route: ${approximateTimeSeconds} seconds, skipping job`
			);
			return false;
		}

		// Distance validation: check if route distance is suspiciously high
		// Calculate straight-line distance between start and end using Turf.js
		const startPoint = [Number(startAddress.lon), Number(startAddress.lat)]; // [longitude, latitude] for Turf
		const endPoint = [Number(endAddress.lon), Number(endAddress.lat)];
		const straightLineDistanceKm = distance(startPoint, endPoint, { units: 'kilometers' });

		// Reject if route distance is more than 10x the straight-line distance
		if (totalDistanceKm > straightLineDistanceKm * 10) {
			return false; // Suspiciously long route, skip silently
		}

		// Compute job value
		const approximateValue = computeApproximateJobValue(
			jobTier,
			jobCategory,
			totalDistanceKm,
			approximateTimeSeconds
		);

		// Find end address ID by coordi

		// Create route record with address IDs
		const routeRecord = {
			id: crypto.randomUUID(),
			startAddressId: startAddress.id,
			endAddressId: endAddress.id,
			lengthTime: approximateTimeSeconds,
			routeData: routeResult
		};

		// Insert route
		await db.insert(routes).values(routeRecord);

		// Create job record
		const jobRecord: JobInsert = {
			location: `SRID=4326;POINT(${startAddress.lon} ${startAddress.lat})`, // PostGIS POINT geometry with SRID
			startAddressId: startAddress.id,
			endAddressId: endAddress.id,
			routeId: routeRecord.id,
			jobTier,
			jobCategory,
			totalDistanceKm,
			approximateTimeSeconds,
			approximateValue
		};

		// Insert job
		await db.insert(jobs).values(jobRecord);

		return true;
	} catch (error) {
		// Re-throw the error so it can be logged by the caller
		throw new Error(
			`Job generation failed: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Clears all existing jobs and their associated routes
 */
export async function clearAllJobs(): Promise<void> {
	// Get all job route IDs before deletion
	const jobRoutes = await db.select({ routeId: jobs.routeId }).from(jobs);
	const routeIds = jobRoutes.map((jr) => jr.routeId);

	// Delete jobs first (foreign key constraint)
	await db.delete(jobs);

	// Delete associated routes
	if (routeIds.length > 0) {
		await db.delete(routes).where(inArray(routes.id, routeIds));
	}

	console.log(`Cleared ${jobRoutes.length} jobs and their routes`);
}
