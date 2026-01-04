import { redisClient } from '../redis';
import { serverLog } from '../logging/serverLogger';

const KEY_PREFIX = 'activeRoute:';

function getKey(activeJobId: string): string {
	return `${KEY_PREFIX}${activeJobId}`;
}

/**
 * Get gzipped route data from Redis cache
 *
 * Parameters
 * -----------
 * activeJobId: string
 *     The active job ID
 *
 * Returns
 * --------
 * Promise<Buffer | null>
 *     The gzipped route data, or null if not found
 */
export async function getRoute(activeJobId: string): Promise<Buffer | null> {
	try {
		const key = getKey(activeJobId);
		const data = await redisClient.get(key);
		if (!data) {
			return null;
		}
		// Redis returns string, convert to Buffer
		return Buffer.from(data, 'binary');
	} catch (err) {
		serverLog.api.error(
			{
				activeJobId,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error getting route from Redis'
		);
		// Return null on error (cache miss) - don't throw, allow route computation to proceed
		return null;
	}
}

/**
 * Store gzipped route data in Redis cache with TTL
 *
 * Parameters
 * -----------
 * activeJobId: string
 *     The active job ID
 * gzippedData: Buffer
 *     The gzipped route data to store
 * ttlSeconds: number
 *     Time to live in seconds
 *
 * Returns
 * --------
 * Promise<void>
 */
export async function setRoute(
	activeJobId: string,
	gzippedData: Buffer,
	ttlSeconds: number
): Promise<void> {
	try {
		const key = getKey(activeJobId);
		// Convert Buffer to string for Redis (binary encoding)
		const dataString = gzippedData.toString('binary');
		await redisClient.setEx(key, ttlSeconds, dataString);
	} catch (err) {
		serverLog.api.error(
			{
				activeJobId,
				ttlSeconds,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error setting route in Redis'
		);
		// Don't throw - allow the application to continue even if Redis fails
		// The route will just be recomputed on next request
	}
}

/**
 * Extend the TTL of a cached route
 *
 * Parameters
 * -----------
 * activeJobId: string
 *     The active job ID
 * ttlSeconds: number
 *     New time to live in seconds
 *
 * Returns
 * --------
 * Promise<boolean>
 *     True if TTL was extended, false if key doesn't exist
 */
export async function extendRouteTTL(activeJobId: string, ttlSeconds: number): Promise<boolean> {
	try {
		const key = getKey(activeJobId);
		const result = await redisClient.expire(key, ttlSeconds);
		return result;
	} catch (err) {
		serverLog.api.error(
			{
				activeJobId,
				ttlSeconds,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error extending route TTL in Redis'
		);
		// Return false on error (key doesn't exist or Redis error)
		return false;
	}
}
