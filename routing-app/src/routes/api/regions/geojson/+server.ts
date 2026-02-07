import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { regions } from '$lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import type { FeatureCollection } from 'geojson';

/**
 * GET /api/regions/geojson
 * Returns all NUTS regions as a GeoJSON FeatureCollection
 * Geometry is transformed from EPSG:3857 (Web Mercator) to EPSG:4326 (WGS84)
 */
export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		// Query all regions with geometry transformed to GeoJSON
		// ST_AsGeoJSON returns a JSON string, so we parse it
		const result = await db
			.select({
				id: regions.id,
				code: regions.code,
				nameLatin: regions.nameLatin,
				nameLocal: regions.nameLocal,
				countryCode: regions.countryCode,
				geometry: sql<object>`ST_AsGeoJSON(ST_Transform(${regions.geom}::geometry(MultiPolygon, 3857), 4326))::jsonb`.as(
					'geometry'
				)
			})
			.from(regions);

		// Build GeoJSON FeatureCollection
		const features = result.map((region) => ({
			type: 'Feature' as const,
			geometry: region.geometry,
			properties: {
				id: region.id,
				code: region.code,
				nameLatin: region.nameLatin || null,
				nameLocal: region.nameLocal || null,
				countryCode: region.countryCode || null
			}
		}));

		const featureCollection: FeatureCollection = {
			type: 'FeatureCollection',
			features
		};

		serverLog.api.info(
			{
				event: 'regions.geojson.fetch',
				user_id: session.user.id,
				region_count: features.length
			},
			`Fetched ${features.length} regions as GeoJSON`
		);

		return json(featureCollection, {
			headers: {
				'Content-Type': 'application/geo+json'
			}
		});
	} catch (err) {
		serverLog.api.error(
			{
				event: 'regions.geojson.fetch.error',
				user_id: session.user.id,
				err:
					err instanceof Error
						? {
								name: err.name,
								message: err.message,
								stack: err.stack
							}
						: err
			},
			'Error fetching regions GeoJSON'
		);
		return error(500, 'Failed to fetch regions GeoJSON');
	}
};
