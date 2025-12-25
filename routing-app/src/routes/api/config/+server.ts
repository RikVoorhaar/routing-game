import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { config, vehiclesConfig } from '$lib/server/config';

/**
 * GET /api/config - Returns the game configuration including vehicles config
 * This endpoint exposes the config to the client
 */
export const GET: RequestHandler = async () => {
	return json({
		...config,
		vehicles: vehiclesConfig
	});
};
