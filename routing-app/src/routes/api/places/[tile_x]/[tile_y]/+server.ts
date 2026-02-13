import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { getPlaces, setPlaces } from '$lib/server/placesCache';
import { gzipSync } from 'zlib';

// GET /api/places/[tile_x]/[tile_y] - Get gzipped places data for a tile at zoom level 8
export const GET: RequestHandler = async ({ params }) => {
	const tileXStr = params.tile_x;
	const tileYStr = params.tile_y;

	if (!tileXStr || !tileYStr) {
		return error(400, 'Tile coordinates are required');
	}

	let tileX: number;
	let tileY: number;

	try {
		tileX = parseInt(tileXStr, 10);
		tileY = parseInt(tileYStr, 10);
	} catch {
		return error(400, 'Invalid tile coordinates');
	}

	if (isNaN(tileX) || isNaN(tileY)) {
		return error(400, 'Invalid tile coordinates');
	}

	try {
		serverLog.api.debug({ tileX, tileY }, 'Fetching places for tile');

		// Check Redis cache first
		let placesDataGzip = await getPlaces(tileX, tileY);

		// If places don't exist in cache, query database and compress
		if (!placesDataGzip) {
			serverLog.api.debug({ tileX, tileY }, 'Places not found in cache, querying database');

			// Query places table for all places in this tile using raw SQL
			// Compute tile coordinates from geom at zoom level 8 and filter by requested tile
			// Join with categories and regions to get category name and region code
			// Extract lat/lon from geom
			const result = await db.execute(
				sql`
					SELECT 
						p.id,
						COALESCE(c.name, 'unknown') as category,
						ST_Y(ST_Transform(p.geom, 4326)) as lat,
						ST_X(ST_Transform(p.geom, 4326)) as lon,
						COALESCE(r.code, 'unknown') as region
					FROM places p
					LEFT JOIN categories c ON p.category_id = c.id
					LEFT JOIN region r ON p.region_id = r.id
					WHERE 
						FLOOR((ST_X(ST_Transform(p.geom, 4326)) + 180.0) / 360.0 * POWER(2, 8))::integer = ${tileX}
						AND FLOOR((1.0 - LN(TAN(RADIANS(ST_Y(ST_Transform(p.geom, 4326)))) + 1.0 / COS(RADIANS(ST_Y(ST_Transform(p.geom, 4326))))) / PI()) / 2.0 * POWER(2, 8))::integer = ${tileY}
				`
			);

			// Transform result to match expected format
			const placesList = (result as Array<{ id: bigint; category: string; lat: number; lon: number; region: string }>).map((row) => ({
				id: Number(row.id),
				category: row.category,
				lat: Number(row.lat),
				lon: Number(row.lon),
				region: row.region
			}));

			// Build JSON array of places
			const placesJson = JSON.stringify(placesList);

			// Compress JSON using gzip
			placesDataGzip = gzipSync(placesJson);

			// Store in Redis with 1 hour TTL
			await setPlaces(tileX, tileY, placesDataGzip);

			serverLog.api.debug(
				{ tileX, tileY, placesCount: placesList.length, dataLength: placesDataGzip.length },
				'Places queried, compressed, and stored in Redis'
			);
		} else {
			serverLog.api.debug(
				{ tileX, tileY, dataLength: placesDataGzip.length },
				'Places retrieved from Redis cache'
			);
		}

		if (!placesDataGzip || placesDataGzip.length === 0) {
			serverLog.api.warn(
				{ tileX, tileY, bufferLength: placesDataGzip?.length },
				'Empty places data buffer'
			);
			// Return empty array instead of error for tiles with no places
			const emptyJson = JSON.stringify([]);
			const emptyGzip = gzipSync(emptyJson);
			return new Response(emptyGzip, {
				headers: {
					'Content-Type': 'application/json',
					'Content-Encoding': 'gzip'
				}
			});
		}

		serverLog.api.debug({ tileX, tileY, dataLength: placesDataGzip.length }, 'Returning places data');

		// Return gzip data with Content-Encoding header
		return new Response(placesDataGzip, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Encoding': 'gzip'
			}
		});
	} catch (err) {
		serverLog.api.error(
			{
				tileX,
				tileY,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error fetching places'
		);
		return error(
			500,
			`Failed to fetch places: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
