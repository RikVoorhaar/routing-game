import { type InferSelectModel } from 'drizzle-orm';
import { jobs } from '$lib/server/db/schema';
import { db } from '$lib/server/db/standalone';
import { sql, desc, eq } from 'drizzle-orm';
import { getTileBounds } from '$lib/geo';
import type { Coordinate } from '$lib/server/db/schema';

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
		.where(
			sql`ST_Within(
            ST_GeomFromEWKT(${jobs.location}),
            ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)
        )`
		)
		.orderBy(desc(jobs.totalDistanceKm))
		.limit(limit);

	return result;
}

/**
 * Gets the closest jobs for an employee by tier, ordered by straight-line distance
 * Uses PostGIS ST_DistanceSphere for accurate distance calculation
 * Optimized to use spatial indexes efficiently
 *
 * Parameters
 * -----------
 * employeeLocation: Coordinate
 *     The employee's current location (lat/lon)
 * tier: number
 *     The job tier to filter by
 * limit: number
 *     Maximum number of jobs to return (default: 2)
 *
 * Returns
 * --------
 * Array of jobs ordered by distance (closest first)
 */
export async function getClosestJobsForEmployeeByTier(
	employeeLocation: Coordinate,
	tier: number,
	limit: number = 2
): Promise<Array<InferSelectModel<typeof jobs>>> {
	// Create a PostGIS POINT from employee location
	// Use ST_DistanceSphere for accurate distance calculation
	// The spatial index (GIST) on jobs.location should help with performance
	const employeePoint = sql`ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat})::geometry`;
	
	const result = await db
		.select()
		.from(jobs)
		.where(eq(jobs.jobTier, tier))
		.orderBy(
			sql`ST_DistanceSphere(
				ST_GeomFromEWKT(${jobs.location}),
				${employeePoint}
			) ASC`
		)
		.limit(limit);

	return result;
}
