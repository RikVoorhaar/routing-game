import { type InferSelectModel } from 'drizzle-orm';
import { jobs } from '$lib/server/db/schema';
import { db } from '$lib/server/db/standalone';
import { sql, eq, and } from 'drizzle-orm';
import type { Coordinate } from '$lib/server/db/schema';
import { config } from '$lib/server/config';

/**
 * Gets the closest jobs for an employee by tier, ordered by straight-line distance
 * Uses PostGIS KNN (<->) operator with GiST index for fast nearest-neighbor search
 * Filters to jobs within configured radius using ST_DWithin for efficient spatial filtering
 *
 * Parameters
 * -----------
 * employeeLocation: Coordinate
 *     The employee's current location (lat/lon in EPSG:4326)
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
	// Transform employee location from 4326 (lat/lon degrees) to 3857 (WebMercator meters)
	// jobs.location is stored as geometry(Point,3857), so we need to match that SRID
	const employeePoint3857 = sql`ST_Transform(ST_SetSRID(ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat}), 4326), 3857)`;

	const searchRadiusMeters = config.jobs.search.radiusMeters;

	const result = await db
		.select({
			id: jobs.id,
			location: sql<string>`ST_AsEWKT(ST_Transform(${jobs.location}, 4326))`.as('location'),
			startAddressId: jobs.startAddressId,
			endAddressId: jobs.endAddressId,
			jobTier: jobs.jobTier,
			jobCategory: jobs.jobCategory,
			totalDistanceKm: jobs.totalDistanceKm,
			generatedTime: jobs.generatedTime
		})
		.from(jobs)
		.where(
			and(
				eq(jobs.jobTier, tier),
				// Filter to jobs within configured radius (meters in WebMercator)
				sql`ST_DWithin(${jobs.location}, ${employeePoint3857}, ${searchRadiusMeters})`
			)
		)
		.orderBy(sql`${jobs.location} <-> ${employeePoint3857}`)
		.limit(limit);

	return result;
}
