import { createClient } from 'redis';
import { env } from '$env/dynamic/private';
import { serverLog } from './logging/serverLogger';

if (!env.REDIS_URL || env.REDIS_URL.trim() === '') {
	throw new Error('REDIS_URL is not set or is empty');
}

// Validate Redis URL format
if (!env.REDIS_URL.startsWith('redis://') && !env.REDIS_URL.startsWith('rediss://')) {
	throw new Error(`REDIS_URL must start with 'redis://' or 'rediss://', got: ${env.REDIS_URL}`);
}

const client = createClient({
	url: env.REDIS_URL
});

client.on('error', (err) => {
	serverLog.api.error({ error: err.message, stack: err.stack }, 'Redis client error');
});

client.on('connect', () => {
	serverLog.api.info({ url: env.REDIS_URL }, 'Redis client connected');
});

client.on('reconnecting', () => {
	serverLog.api.warn({ url: env.REDIS_URL }, 'Redis client reconnecting');
});

// Connect on module load
client.connect().catch((err) => {
	serverLog.api.error(
		{ error: err.message, stack: err.stack, url: env.REDIS_URL },
		'Failed to connect to Redis'
	);
	// Don't throw - let the application start, but Redis operations will fail
	// This allows the app to run even if Redis is temporarily unavailable
});

export { client as redisClient };
