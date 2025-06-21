import { type InferSelectModel } from 'drizzle-orm';
import { addresses, jobs, routes } from './server/db/schema';
import { getRandomRouteInAnnulus } from './routing';
import { type Coordinate } from './types';
import { db, client } from './server/db/standalone';
import { sql, desc, inArray } from 'drizzle-orm';
import { distance } from '@turf/turf';
import { getTileBounds } from './geo';
import { JobCategory } from './jobCategories';

// Constants for job generation
export const ROUTE_DISTANCES_KM = [
    0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000
];

export const MAX_TIER = 8; // Cut off at tier 8 for small map

// Category multipliers for value calculation
const CATEGORY_MULTIPLIERS = {
    [JobCategory.GROCERIES]: 1,
    [JobCategory.PACKAGES]: 1,
    [JobCategory.FOOD]: 1.2,
    [JobCategory.FURNITURE]: 1.5,
    [JobCategory.PEOPLE]: 2.0,
    [JobCategory.FRAGILE_GOODS]: 3.0,
    [JobCategory.CONSTRUCTION]: 4.0,
    [JobCategory.LIQUIDS]: 6.0,
    [JobCategory.TOXIC_GOODS]: 10.0
};

// Minimum tier requirements for each category
const CATEGORY_MIN_TIERS = {
    [JobCategory.GROCERIES]: 1,
    [JobCategory.PACKAGES]: 1,
    [JobCategory.FOOD]: 2,
    [JobCategory.FURNITURE]: 3,
    [JobCategory.PEOPLE]: 4,
    [JobCategory.FRAGILE_GOODS]: 5,
    [JobCategory.CONSTRUCTION]: 6,
    [JobCategory.LIQUIDS]: 7,
    [JobCategory.TOXIC_GOODS]: 8
};

// Value calculation constants
const DEFAULT_DISTANCE_FACTOR = 1; // 1 euro per kilometer
const DEFAULT_TIME_FACTOR = 20.0 / 3600; // 20 euros per hour

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
 * Computes job tier using probability formula: tier = min(MAX_TIER, ceil(-log2(p)))
 */
export function computeJobTier(): number {
    const p = Math.random();
    const tier = Math.ceil(-Math.log2(p));
    return Math.min(MAX_TIER, tier);
}

/**
 * Computes job value based on tier, category, distance, and time
 */
export function computeJobValue(
    jobTier: number,
    jobCategory: JobCategory,
    totalDistanceKm: number,
    totalTimeSeconds: number,
    distanceFactor: number = DEFAULT_DISTANCE_FACTOR,
    timeFactor: number = DEFAULT_TIME_FACTOR
): number {
    const jobTierMultiplier = Math.pow(1.2, jobTier - 1);
    const categoryMultiplier = CATEGORY_MULTIPLIERS[jobCategory];
    
    // Random factor: usually near 1, but can be quite big
    const randomFactor = Math.max(1.0, -Math.log(1 - Math.random()));
    
    const totalTimeHours = totalTimeSeconds / 3600;
    const baseValue = totalDistanceKm * distanceFactor + totalTimeHours * timeFactor;
    
    return jobTierMultiplier * categoryMultiplier * randomFactor * baseValue;
}

/**
 * Generates a single job from a given address
 */
export async function generateJobFromAddress(startAddress: InferSelectModel<typeof addresses>): Promise<boolean> {
    try {
        // Compute job tier
        const jobTier = computeJobTier();
        
        // Get distance range for this tier
        const minDistanceKm = ROUTE_DISTANCES_KM[jobTier - 1] || 0.1;
        const maxDistanceKm = ROUTE_DISTANCES_KM[jobTier] || ROUTE_DISTANCES_KM[ROUTE_DISTANCES_KM.length - 1];
        
        // Generate route within the specified annulus
        const startLocation: Coordinate = {
            lat: Number(startAddress.lat),
            lon: Number(startAddress.lon)
        };
        
        const routeResult = await getRandomRouteInAnnulus(
            startLocation,
            minDistanceKm,
            maxDistanceKm
        );
        
        // Get available categories for this tier
        const availableCategories = getAvailableCategories(jobTier);
        
        if (availableCategories.length === 0) {
            return false; // No available categories for this tier
        }
        
        // Randomly select a category
        const jobCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        
        // Calculate total distance and time
        const totalDistanceKm = routeResult.totalDistanceMeters / 1000;
        const totalTimeSeconds = routeResult.travelTimeSeconds;
        
        // Validate travel time - if it's 0 or invalid, skip this job
        if (!totalTimeSeconds || totalTimeSeconds <= 0) {
            console.warn(`Invalid travel time for route: ${totalTimeSeconds} seconds, skipping job`);
            return false;
        }
        
        // Distance validation: check if route distance is suspiciously high
        // Calculate straight-line distance between start and end using Turf.js
        const startPoint = [Number(startAddress.lon), Number(startAddress.lat)]; // [longitude, latitude] for Turf
        const endPoint = [routeResult.destination.lon, routeResult.destination.lat];
        const straightLineDistanceKm = distance(startPoint, endPoint, { units: 'kilometers' });
        
        // Reject if route distance is more than 10x the straight-line distance
        if (totalDistanceKm > straightLineDistanceKm * 10) {
            return false; // Suspiciously long route, skip silently
        }
        
        // Compute job value
        const approximateValue = computeJobValue(jobTier, jobCategory, totalDistanceKm, totalTimeSeconds);
        
        // Find end address ID by coordinates (approximate match)
        const endAddressResults = await db.select()
            .from(addresses)
            .where(sql`
                abs(${addresses.lat} - ${routeResult.destination.lat}) < 0.0001 
                AND abs(${addresses.lon} - ${routeResult.destination.lon}) < 0.0001
            `)
            .limit(1);
        
        let endAddressId = endAddressResults[0]?.id;
        
        if (!endAddressId) {
            // If no exact match, find closest address using PostGIS
            const endAddressQuery = await db.execute(sql`
                SELECT id FROM address 
                ORDER BY ST_Distance(
                    ST_Point(${routeResult.destination.lon}, ${routeResult.destination.lat}),
                    ST_GeomFromText(location)
                ) 
                LIMIT 1
            `);
            
            if (endAddressQuery.length === 0) {
                // Silently skip this job - no suitable end address found
                return false;
            }
            
            endAddressId = (endAddressQuery[0] as { id: string }).id;
        }
        
        // Create route record with address IDs
        const routeRecord = {
            id: crypto.randomUUID(),
            startAddressId: startAddress.id,
            endAddressId: endAddressId,
            lengthTime: totalTimeSeconds.toString(),
            goodsType: JobCategory[jobCategory].toLowerCase(),
            weight: '0', // Jobs don't have weight like employee routes
            reward: approximateValue.toString(),
            routeData: routeResult.path
        };
        
        // Insert route
        await db.insert(routes).values(routeRecord);
        
        // Create job record
        const jobRecord = {
            location: `SRID=4326;POINT(${startAddress.lon} ${startAddress.lat})`, // PostGIS POINT geometry with SRID
            startAddressId: startAddress.id,
            endAddressId: endAddressId,
            routeId: routeRecord.id,
            jobTier,
            jobCategory,
            totalDistanceKm: totalDistanceKm.toString(),
            totalTimeSeconds: totalTimeSeconds.toString(),
            approximateValue: approximateValue.toString()
        };
        
        // Insert job
        await db.insert(jobs).values(jobRecord);
        
        return true;
    } catch {
        // All errors are handled silently - return false to indicate failure
        // This includes routing errors, database errors, and any other issues
        return false;
    }
}

/**
 * Generates jobs for 1% of all addresses, sorted by value (importance sampling)
 */
export async function generateAllJobs(): Promise<void> {
    console.log('Starting job generation...');
    
    // Clear existing jobs and their routes
    await clearAllJobs();
    
    // Get total address count first
    const totalAddressCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM address`);
    const totalAddresses = Number(totalAddressCountResult[0]?.count || 0);
    
    console.log(`Found ${totalAddresses} total addresses`);
    
    // Sample 1% of addresses using SQL random
    const sampleSize = Math.ceil(totalAddresses * 0.01);
    const sampledAddresses = await db.execute(sql`
        SELECT * FROM address 
        ORDER BY RANDOM() 
        LIMIT ${sampleSize}
    `) as unknown as Array<InferSelectModel<typeof addresses>>;
    
    console.log(`Generating jobs for ${sampledAddresses.length} addresses (1% random sample)`);
    
    let successCount = 0;
    let totalAttempts = 0;
    const startTime = Date.now();
    
    for (const address of sampledAddresses) {
        totalAttempts++;
        const success = await generateJobFromAddress(address);
        if (success) {
            successCount++;
        }
        
        // Log progress every 100 jobs
        if (totalAttempts % 100 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = totalAttempts / elapsed;
            const eta = (sampledAddresses.length - totalAttempts) / rate;
            console.log(`Generated ${successCount} jobs... (${totalAttempts}/${sampledAddresses.length}, ${rate.toFixed(1)}/s, ETA: ${eta.toFixed(0)}s)`);
        }
    }
    
    console.log(`Job generation complete! Created ${successCount} jobs out of ${sampledAddresses.length} attempts`);
    console.log(`Success rate: ${(successCount / sampledAddresses.length * 100).toFixed(1)}%`);
    
    // Log some statistics
    const jobStats = await db.execute(sql`
        SELECT 
            job_tier,
            job_category,
            COUNT(*) as count,
            AVG(approximate_value) as avg_value
        FROM job 
        GROUP BY job_tier, job_category 
        ORDER BY job_tier, job_category
    `);
    
    console.log('Job statistics:', jobStats);
}

/**
 * Clears all existing jobs and their associated routes
 */
export async function clearAllJobs(): Promise<void> {
    // Get all job route IDs before deletion
    const jobRoutes = await db.select({ routeId: jobs.routeId }).from(jobs);
    const routeIds = jobRoutes.map(jr => jr.routeId);
    
    // Delete jobs first (foreign key constraint)
    await db.delete(jobs);
    
    // Delete associated routes
    if (routeIds.length > 0) {
        await db.delete(routes).where(inArray(routes.id, routeIds));
    }
    
    console.log(`Cleared ${jobRoutes.length} jobs and their routes`);
}

/**
 * Gets jobs ordered by value (for importance sampling)
 */
export async function getJobsByValue(limit: number = 50): Promise<Array<InferSelectModel<typeof jobs>>> {
    return await db.select()
        .from(jobs)
        .orderBy(desc(jobs.approximateValue))
        .limit(limit);
}


/**
 * Gets jobs within a tile using x,y,z tile coordinates
 */
export async function getJobsInTile(
    x: number,
    y: number,
    z: number,
    limit: number = 100
): Promise<Array<InferSelectModel<typeof jobs>>> {
    // Convert tile coordinates to geographic bounds
    const bounds = getTileBounds(x, y, z);
    
    // Use Drizzle query builder to get proper field name conversion
    const result = await db
        .select()
        .from(jobs)
        .where(sql`ST_Within(
            ST_GeomFromEWKT(${jobs.location}),
            ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)
        )`)
        .orderBy(desc(jobs.approximateValue))
        .limit(limit);
    
    return result;
}

// Export client for connection management
export { client }; 