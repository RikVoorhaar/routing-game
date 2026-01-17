import { redisClient } from './redis';
import { serverLog } from './logging/serverLogger';

const KEY_PREFIX = 'places:z8:';

function getKey(tileX: number, tileY: number): string {
	return `${KEY_PREFIX}${tileX}:${tileY}`;
}

/**
 * Get gzipped places data from Redis cache and reset TTL
 *
 * Parameters
 * -----------
 * tileX: number
 *     The tile X coordinate at zoom level 8
 * tileY: number
 *     The tile Y coordinate at zoom level 8
 *
 * Returns
 * --------
 * Promise<Buffer | null>
 *     The gzipped places data, or null if not found
 */
export async function getPlaces(tileX: number, tileY: number): Promise<Buffer | null> {
	try {
		const key = getKey(tileX, tileY);
		const data = await redisClient.get(key);
		if (!data) {
			return null;
		}
		
		// Reset TTL to 1 hour on every access
		const ttlSeconds = 3600; // 1 hour
		await redisClient.expire(key, ttlSeconds);
		
		// redis package returns string by default, convert to Buffer
		// If it's already a Buffer, use it directly
		if (Buffer.isBuffer(data)) {
			return data;
		}
		// Convert string to Buffer (redis stores binary as string)
		return Buffer.from(data as string, 'binary');
	} catch (err) {
		serverLog.api.error(
			{
				tileX,
				tileY,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error getting places from Redis'
		);
		// Return null on error (cache miss) - don't throw, allow query to proceed
		return null;
	}
}

/**
 * Store gzipped places data in Redis cache with TTL
 *
 * Parameters
 * -----------
 * tileX: number
 *     The tile X coordinate at zoom level 8
 * tileY: number
 *     The tile Y coordinate at zoom level 8
 * gzippedData: Buffer
 *     The gzipped places data to store
 *
 * Returns
 * --------
 * Promise<void>
 */
export async function setPlaces(
	tileX: number,
	tileY: number,
	gzippedData: Buffer
): Promise<void> {
	try {
		const key = getKey(tileX, tileY);
		const ttlSeconds = 3600; // 1 hour
		// Convert Buffer to binary string for Redis (preserves binary data)
		await redisClient.setEx(key, ttlSeconds, gzippedData.toString('binary'));
	} catch (err) {
		serverLog.api.error(
			{
				tileX,
				tileY,
				ttlSeconds: 3600,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error setting places in Redis'
		);
		// Don't throw - allow the application to continue even if Redis fails
		// The places will just be recomputed on next request
	}
}
