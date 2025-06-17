import { type InferSelectModel } from 'drizzle-orm';
import { addresses, jobs, routes } from './server/db/schema';
import { getRandomRouteInAnnulus } from './routing';
import { type Coordinate } from './types';
import { db, client } from './server/db/standalone';
import { sql, desc, inArray } from 'drizzle-orm';
import { distance } from '@turf/turf';
import { getTileBounds } from './geo';

// Performance profiling utility
class Profiler {
    private timers: Map<string, number> = new Map();
    private stats: Map<string, { total: number; count: number; min: number; max: number }> = new Map();

    start(label: string): void {
        this.timers.set(label, performance.now());
    }

    end(label: string): number {
        const start = this.timers.get(label);
        if (!start) return 0;
        
        const duration = performance.now() - start;
        this.timers.delete(label);
        
        // Update statistics
        const existing = this.stats.get(label);
        if (existing) {
            existing.total += duration;
            existing.count++;
            existing.min = Math.min(existing.min, duration);
            existing.max = Math.max(existing.max, duration);
        } else {
            this.stats.set(label, { total: duration, count: 1, min: duration, max: duration });
        }
        
        return duration;
    }

    getStats(): Map<string, { total: number; count: number; min: number; max: number; avg: number }> {
        const result = new Map();
        for (const [label, stats] of this.stats) {
            result.set(label, {
                ...stats,
                avg: stats.total / stats.count
            });
        }
        return result;
    }

    reset(): void {
        this.timers.clear();
        this.stats.clear();
    }

    report(): void {
        console.log('\n🔍 Performance Profile:');
        console.log('Operation'.padEnd(25) + '| Count | Avg (ms) | Total (ms) | Min (ms) | Max (ms)');
        console.log('-'.repeat(80));
        
        const sortedStats = Array.from(this.getStats().entries())
            .sort(([,a], [,b]) => b.total - a.total);
            
        for (const [label, stats] of sortedStats) {
            console.log(
                label.padEnd(25) + 
                `| ${String(stats.count).padStart(5)} | ` +
                `${stats.avg.toFixed(1).padStart(8)} | ` +
                `${stats.total.toFixed(1).padStart(10)} | ` +
                `${stats.min.toFixed(1).padStart(8)} | ` +
                `${stats.max.toFixed(1).padStart(8)}`
            );
        }
        console.log();
    }
}

const profiler = new Profiler();

// Constants for job generation
export const ROUTE_DISTANCES_KM = [
    0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000
];

export const MAX_TIER = 8; // Cut off at tier 8 for small map

// Job categories enum with minimum tiers
export enum JobCategory {
    GROCERIES = 0,      // min tier 1
    PACKAGES = 1,       // min tier 1
    FOOD = 2,           // min tier 2, requires moped
    FURNITURE = 3,      // min tier 3, requires car
    PEOPLE = 4,         // min tier 4, requires taxi license
    FRAGILE_GOODS = 5,  // min tier 5, requires fragile goods license
    CONSTRUCTION = 6,   // min tier 6, requires trucking license
    LIQUIDS = 7,        // min tier 7, requires liquids license
    TOXIC_GOODS = 8     // min tier 8, requires toxic goods license
}

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
    profiler.start('generateJobFromAddress');
    
    try {
        // Compute job tier
        profiler.start('computeJobTier');
        const jobTier = computeJobTier();
        profiler.end('computeJobTier');
        
        // Get distance range for this tier
        const minDistanceKm = ROUTE_DISTANCES_KM[jobTier - 1] || 0.1;
        const maxDistanceKm = ROUTE_DISTANCES_KM[jobTier] || ROUTE_DISTANCES_KM[ROUTE_DISTANCES_KM.length - 1];
        
        // Generate route within the specified annulus
        const startLocation: Coordinate = {
            lat: Number(startAddress.lat),
            lon: Number(startAddress.lon)
        };
        
        profiler.start('getRandomRouteInAnnulus');
        const routeResult = await getRandomRouteInAnnulus(
            startLocation,
            minDistanceKm,
            maxDistanceKm
        );
        profiler.end('getRandomRouteInAnnulus');
        
        // Get available categories for this tier
        profiler.start('getAvailableCategories');
        const availableCategories = getAvailableCategories(jobTier);
        profiler.end('getAvailableCategories');
        
        if (availableCategories.length === 0) {
            profiler.end('generateJobFromAddress');
            return false; // No available categories for this tier
        }
        
        // Randomly select a category
        const jobCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        
        // Calculate total distance and time
        const totalDistanceKm = routeResult.totalDistanceMeters / 1000;
        const totalTimeSeconds = routeResult.travelTimeSeconds;
        
        // Distance validation: check if route distance is suspiciously high
        // Calculate straight-line distance between start and end using Turf.js
        const startPoint = [Number(startAddress.lon), Number(startAddress.lat)]; // [longitude, latitude] for Turf
        const endPoint = [routeResult.destination.lon, routeResult.destination.lat];
        const straightLineDistanceKm = distance(startPoint, endPoint, { units: 'kilometers' });
        
        // Reject if route distance is more than 10x the straight-line distance
        if (totalDistanceKm > straightLineDistanceKm * 10) {
            profiler.end('generateJobFromAddress');
            return false; // Suspiciously long route, skip silently
        }
        
        // Compute job value
        profiler.start('computeJobValue');
        const approximateValue = computeJobValue(jobTier, jobCategory, totalDistanceKm, totalTimeSeconds);
        profiler.end('computeJobValue');
        
        // Create route record
        const routeRecord = {
            id: crypto.randomUUID(),
            startLocation: {
                id: startAddress.id,
                lat: Number(startAddress.lat),
                lon: Number(startAddress.lon),
                street: startAddress.street,
                house_number: startAddress.houseNumber,
                city: startAddress.city,
                postcode: startAddress.postcode
            },
            endLocation: routeResult.destination,
            lengthTime: totalTimeSeconds.toString(),
            startTime: null,
            endTime: null,
            goodsType: JobCategory[jobCategory].toLowerCase(),
            weight: '0', // Jobs don't have weight like employee routes
            reward: approximateValue.toString(),
            routeData: routeResult.path
        };
        
        // Insert route
        profiler.start('insertRoute');
        await db.insert(routes).values(routeRecord);
        profiler.end('insertRoute');
        
        // Find end address ID by coordinates (approximate match)
        profiler.start('findEndAddress');
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
                profiler.end('findEndAddress');
                profiler.end('generateJobFromAddress');
                // Silently skip this job - no suitable end address found
                return false;
            }
            
            endAddressId = (endAddressQuery[0] as { id: string }).id;
        }
        profiler.end('findEndAddress');
        
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
        profiler.start('insertJob');
        await db.insert(jobs).values(jobRecord);
        profiler.end('insertJob');
        
        profiler.end('generateJobFromAddress');
        return true;
    } catch {
        profiler.end('generateJobFromAddress');
        
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
    profiler.reset(); // Reset profiler for fresh statistics
    
    profiler.start('generateAllJobs');
    
    // Clear existing jobs and their routes
    profiler.start('clearAllJobs');
    await clearAllJobs();
    profiler.end('clearAllJobs');
    
    // Get all addresses
    profiler.start('getAllAddresses');
    const allAddresses = await db.select().from(addresses);
    profiler.end('getAllAddresses');
    
    console.log(`Found ${allAddresses.length} total addresses`);
    
    // Sample 1% of addresses
    profiler.start('sampleAddresses');
    const sampleSize = Math.ceil(allAddresses.length * 0.01);
    const sampledAddresses = allAddresses
        .sort(() => Math.random() - 0.5) // Shuffle
        .slice(0, sampleSize);
    profiler.end('sampleAddresses');
    
    console.log(`Generating jobs for ${sampledAddresses.length} addresses (1% sample)`);
    
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
    
    profiler.end('generateAllJobs');
    
    console.log(`Job generation complete! Created ${successCount} jobs out of ${sampledAddresses.length} attempts`);
    console.log(`Success rate: ${(successCount / sampledAddresses.length * 100).toFixed(1)}%`);
    
    // Show performance profile
    profiler.report();
    
    // Log some statistics
    profiler.start('getJobStats');
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
    profiler.end('getJobStats');
    
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
 * Gets jobs within a radius of a location using PostGIS
 */
export async function getJobsNearLocation(
    lat: number, 
    lon: number, 
    radiusKm: number = 10,
    limit: number = 20
): Promise<Array<InferSelectModel<typeof jobs>>> {
    const radiusMeters = radiusKm * 1000;
    
    const result = await db.execute(sql`
        SELECT * FROM job 
        WHERE ST_DWithin(
            ST_SetSRID(ST_Point(${lon}, ${lat}), 4326),
            ST_GeomFromEWKT(location),
            ${radiusMeters}
        )
        ORDER BY approximate_value DESC
        LIMIT ${limit}
    `);
    
    return result as unknown as Array<InferSelectModel<typeof jobs>>;
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
    
    const result = await db.execute(sql`
        SELECT * FROM job 
        WHERE ST_Within(
            ST_GeomFromEWKT(location),
            ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)
        )
        ORDER BY approximate_value DESC
        LIMIT ${limit}
    `);
    
    return result as unknown as Array<InferSelectModel<typeof jobs>>;
}

// Export client for connection management
export { client };

// Export profiler for external use
export { profiler }; 