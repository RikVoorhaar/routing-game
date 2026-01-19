import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { placeGoodsConfig } from '$lib/server/config/placeGoods';

/**
 * GET /api/place-goods - Returns the place goods configuration
 */
export const GET: RequestHandler = async () => {
	return json(placeGoodsConfig);
};
