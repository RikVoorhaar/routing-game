import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { places } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
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

			// Query places table for all places in this tile
			const placesList = await db
				.select({
					id: places.id,
					category: places.category,
					lat: places.lat,
					lon: places.lon,
					region: places.region
				})
				.from(places)
				.where(and(eq(places.tileX, tileX), eq(places.tileY, tileY)));

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
