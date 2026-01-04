import { type InferSelectModel } from 'drizzle-orm';
import { addresses, jobs } from '$lib/server/db/schema';
import { getRandomRouteInAnnulus, type RouteInAnnulus } from '$lib/routes/routing';
import { type Coordinate } from '$lib/server/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { db } from '$lib/server/db/standalone';
import { sql } from 'drizzle-orm';
import { distance } from '@turf/turf';
import { JobCategory } from '$lib/jobs/jobCategories';
import { config } from '$lib/server/config';
import { profiledAsync, profiledSync, profiledCount } from '$lib/profiling';

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
	for (const [category, key] of Object.entries(categoryKeys) as unknown as [
		JobCategory,
		string
	][]) {
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
	for (const [category, key] of Object.entries(categoryKeys) as unknown as [
		JobCategory,
		string
	][]) {
		minTiers[category] = config.jobs.categories.minTiers[key];
	}
	return minTiers;
}

const CATEGORY_MIN_TIERS = getCategoryMinTiers();

// Value calculation constants - loaded from config (distance-only now)
const DEFAULT_DISTANCE_FACTOR = config.jobs.value.distanceFactor;

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
 * Generates a single job from a given address with retry logic
 * @param startAddress The starting address
 * @param initialTier Optional initial tier to use (for retries with higher tier)
 * @param retryCount Current retry attempt (internal use)
 * @returns true if job was successfully created, false otherwise
 */
export async function generateJobFromAddress(
	startAddress: InferSelectModel<typeof addresses>,
	initialTier?: number,
	retryCount: number = 0,
	options?: { dryRun?: boolean }
): Promise<boolean> {
	const MAX_RETRIES = 5;
	// Compute job tier (use provided tier for retries, otherwise generate random)
	const jobTier = initialTier ?? generateJobTier();

	try {
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

		// Get route metadata only (no path array) for job generation
		const routeInAnnulus: RouteInAnnulus = await profiledAsync(
			'job.route.random_in_annulus',
			async () => {
				return await getRandomRouteInAnnulus(
					startLocation,
					minDistanceKm,
					maxDistanceKm,
					undefined, // maxSpeed not needed for job generation
					false // includePath=false: metadata only
				);
			}
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

		// Calculate total distance
		const totalDistanceKm = routeResult.totalDistanceMeters / 1000;

		// Distance validation: check if route distance is suspiciously high
		// Calculate straight-line distance between start and end using Turf.js
		const startPoint = [Number(startAddress.lon), Number(startAddress.lat)]; // [longitude, latitude] for Turf
		const endPoint = [Number(endAddress.lon), Number(endAddress.lat)];
		const straightLineDistanceKm = profiledSync('job.turf.distance', () =>
			distance(startPoint, endPoint, { units: 'kilometers' })
		);

		// Reject if route distance is more than 10x the straight-line distance
		if (totalDistanceKm > straightLineDistanceKm * 10) {
			return false; // Suspiciously long route, skip silently
		}

		// Create job record (no route record needed)
		// Store location as geometry(Point,3857) - transform from lat/lon (4326) to WebMercator (3857)
		// We use raw SQL insert since Drizzle doesn't natively support geometry types in insert values
		if (options?.dryRun) {
			profiledCount('job.db.insert.skipped', 1);
		} else {
			await profiledAsync('job.db.insert', async () => {
				await db.execute(sql`
					INSERT INTO job (
						start_address_id,
						end_address_id,
						job_tier,
						job_category,
						total_distance_km,
						location
					) VALUES (
						${startAddress.id},
						${endAddress.id},
						${jobTier},
						${jobCategory},
						${totalDistanceKm},
						ST_Transform(ST_SetSRID(ST_MakePoint(${startAddress.lon}, ${startAddress.lat}), 4326), 3857)
					)
				`);
			});
		}

		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Retry logic
		if (retryCount < MAX_RETRIES) {
			profiledCount('job.retry.attempt', 1);
			// Case 1: "Failed to get shortest path: Not Found" - retry with another address in annulus
			if (
				errorMessage.includes('Failed to get shortest path') &&
				errorMessage.includes('Not Found')
			) {
				return await generateJobFromAddress(startAddress, initialTier, retryCount + 1, options);
			}

			// Case 2: "No address found in square annulus" - retry with tier+1 (if not max tier)
			if (errorMessage.includes('No address found in square annulus')) {
				if (jobTier < MAX_TIER) {
					return await generateJobFromAddress(startAddress, jobTier + 1, retryCount + 1, options);
				}
			}
		}

		// Re-throw the error if retries exhausted or not a retryable error
		throw new Error(`Job generation failed: ${errorMessage}`);
	}
}

/**
 * Clears all existing jobs
 */
export async function clearAllJobs(): Promise<void> {
	// Delete all jobs
	await db.delete(jobs);

	console.log('Cleared all jobs');
}
