import { type InferSelectModel } from 'drizzle-orm';
import { jobs } from '$lib/server/db/schema';
import { db } from '$lib/server/db/standalone';
import { sql, desc } from 'drizzle-orm';
import { getTileBounds } from '$lib/geo';

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
		.orderBy(desc(jobs.approximateValue))
		.limit(limit);

	return result;
}
