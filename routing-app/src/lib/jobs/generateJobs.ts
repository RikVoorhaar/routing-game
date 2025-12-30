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

// Maximum job tier (constant)
const MAX_TIER = 8;

// Route distance ranges by tier (in kilometers)
// Ranges have significant overlap and follow powers of 2.5
// Tier n: min = 2.5^(n-1) / 10, max = 2.5^(n+1) / 10 (rounded to nice numbers)
// This creates overlap: tier n's max overlaps with tier n+1's min, and tier n's min overlaps with tier n-1's max
const ROUTE_DISTANCES_KM: Record<number, { min: number; max: number }> = {
	1: { min: 0.1, max: 0.6 }, 
	2: { min: 0.25, max: 1.5 }, 
	3: { min: 0.6, max: 4 }, 
	4: { min: 1.5, max: 10 }, 
	5: { min: 4, max: 25 }, 
	6: { min: 10, max: 60 }, 
	7: { min: 25, max: 150 }, 
	8: { min: 60, max: 950 } 
};

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
function getAvailableCategories(jobTier: number): JobCategory[] {
	const categories: JobCategory[] = [];

	for (const category of Object.values(JobCategory)) {
		if (typeof category === 'number' && CATEGORY_MIN_TIERS[category] <= jobTier) {
			categories.push(category);
		}
	}

	return categories;
}

/**
 * Generates the cumulative distribution lookup table (LOT) for tier selection.
 * Uses weights w_i = 2^{-tier/temperature} for tiers 1..MAX_TIER.
 *
 * Returns
 * --------
 * number[]
 *     Cumulative distribution values [CDF_1, CDF_2, ..., CDF_MAX_TIER]
 *     where CDF_i = sum_{j=1}^{i} w_j / sum_{j=1}^{MAX_TIER} w_j
 */
function generateTierDistributionLOT(): number[] {
	const temperature = config.jobs.generation.temperature ?? 2.0;

	// Calculate weights for each tier: w_i = 2^{-i/temperature}
	const weights: number[] = [];
	for (let tier = 1; tier <= MAX_TIER; tier++) {
		weights.push(Math.pow(2, -tier / temperature));
	}

	// Calculate total weight (normalization factor)
	const totalWeight = weights.reduce((sum, w) => sum + w, 0);

	// Generate cumulative distribution
	const cumulative: number[] = [];
	let cumSum = 0;
	for (let i = 0; i < weights.length; i++) {
		cumSum += weights[i] / totalWeight;
		cumulative.push(cumSum);
	}

	return cumulative;
}

// Generate the lookup table once at module initialization
const TIER_DISTRIBUTION_LOT = generateTierDistributionLOT();

/**
 * Computes job tier using weighted distribution with lookup table.
 * Uses weights 2^{-tier/temperature} where temperature is from config.
 */
function generateJobTier(): number {
	const p = Math.random();

	// Binary search for the tier corresponding to random value p
	let left = 0;
	let right = TIER_DISTRIBUTION_LOT.length - 1;

	while (left < right) {
		const mid = Math.floor((left + right) / 2);
		if (TIER_DISTRIBUTION_LOT[mid] < p) {
			left = mid + 1;
		} else {
			right = mid;
		}
	}

	// Return tier (1-indexed, so add 1 to array index)
	return Math.min(left + 1, MAX_TIER);
}

/**
 * Computes job value based on tier, category, distance, and time
 */
function computeApproximateJobValue(
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
		const distanceRange = ROUTE_DISTANCES_KM[jobTier];
		if (!distanceRange) {
			throw new Error(`No distance range found for job tier ${jobTier}`);
		}
		const minDistanceKm = distanceRange.min;
		const maxDistanceKm = distanceRange.max;

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
