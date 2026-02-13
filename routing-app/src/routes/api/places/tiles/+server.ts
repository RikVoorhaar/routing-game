import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { redisClient } from '$lib/server/redis';

const REDIS_KEY = 'places:tiles:list';
const REDIS_TTL_SECONDS = 3600; // 1 hour

interface TileCoordinate {
	tileX: number;
	tileY: number;
}

// GET /api/places/tiles - Get list of all tiles (tileX, tileY) that have places data
export const GET: RequestHandler = async () => {
	try {
		serverLog.api.info({}, 'Fetching list of tiles with places data');

		// Check Redis cache first
		let tilesData: TileCoordinate[] | null = null;
		try {
			const cachedData = await redisClient.get(REDIS_KEY);
			if (cachedData) {
				tilesData = JSON.parse(cachedData as string) as TileCoordinate[];
				// Reset TTL on access
				await redisClient.expire(REDIS_KEY, REDIS_TTL_SECONDS);
				serverLog.api.info(
					{ tileCount: tilesData.length },
					'Retrieved tiles list from Redis cache'
				);
			}
		} catch (redisError) {
			serverLog.api.warn(
				{ error: redisError instanceof Error ? redisError.message : String(redisError) },
				'Error reading from Redis cache, will query database'
			);
		}

		// If not in cache, query database
		if (!tilesData) {
			serverLog.api.info({}, 'Tiles list not found in cache, querying database');

			// Query distinct tile coordinates computed from geom column at zoom level 8
			// Convert geom (EPSG:3857) to lat/lon, then compute tile coordinates
			const result = await db.execute(
				sql`
					SELECT DISTINCT 
						FLOOR((ST_X(ST_Transform(geom, 4326)) + 180.0) / 360.0 * POWER(2, 8))::integer as "tileX",
						FLOOR((1.0 - LN(TAN(RADIANS(ST_Y(ST_Transform(geom, 4326)))) + 1.0 / COS(RADIANS(ST_Y(ST_Transform(geom, 4326))))) / PI()) / 2.0 * POWER(2, 8))::integer as "tileY"
					FROM places
					ORDER BY "tileX", "tileY"
				`
			);

			// postgres-js execute returns an array directly
			tilesData = (result as Array<{ tileX: number; tileY: number }>).map((row) => ({
				tileX: row.tileX,
				tileY: row.tileY
			}));

			serverLog.api.info(
				{ tileCount: tilesData.length },
				'Queried distinct tiles from database'
			);

			// Store in Redis cache
			try {
				await redisClient.setEx(REDIS_KEY, REDIS_TTL_SECONDS, JSON.stringify(tilesData));
				serverLog.api.info({ tileCount: tilesData.length }, 'Stored tiles list in Redis cache');
			} catch (redisError) {
				serverLog.api.warn(
					{ error: redisError instanceof Error ? redisError.message : String(redisError) },
					'Error storing in Redis cache, continuing anyway'
				);
			}
		}

		return json(tilesData);
	} catch (err) {
		serverLog.api.error(
			{
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error fetching tiles list'
		);
		return json({ error: 'Failed to fetch tiles list' }, { status: 500 });
	}
};
