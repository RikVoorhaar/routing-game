import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { config } from '$lib/server/config';

/**
 * GET /api/config - Returns the game configuration
 * Note: Vehicle and upgrade definitions are imported directly from TypeScript code,
 * not served via this API endpoint
 */
export const GET: RequestHandler = async () => {
	return json(config);
};
