import { getPlaceRoute, setPlaceRoute } from '$lib/stores/routeCache';
import type { PathPoint, Coordinate } from '$lib/server/db/schema';
import { log } from '$lib/logger';

export interface PlaceRouteResult {
	path: PathPoint[];
	travelTimeSeconds: number;
	totalDistanceMeters: number;
	startLocation: Coordinate;
	endLocation: Coordinate;
}

/**
 * Compute route between two places with caching
 * Checks IndexedDB cache first, then calls server API on cache miss
 * 
 * @param employeeId - Employee ID
 * @param startPlaceId - Start place ID
 * @param endPlaceId - End place ID
 * @returns Route result or null if route not found
 */
export async function computePlaceRoute(
	employeeId: string,
	startPlaceId: number,
	endPlaceId: number
): Promise<PlaceRouteResult | null> {
	try {
		// Check cache first
		const cachedRoute = await getPlaceRoute(employeeId, startPlaceId, endPlaceId);
		if (cachedRoute) {
			log.info(
				`[PlaceRouteCompute] Cache hit for route ${employeeId}_${startPlaceId}_${endPlaceId}`
			);
			return {
				path: cachedRoute.path,
				travelTimeSeconds: cachedRoute.durationSeconds,
				totalDistanceMeters: cachedRoute.totalDistanceMeters,
				startLocation: cachedRoute.startLocation,
				endLocation: cachedRoute.endLocation
			};
		}

		// Cache miss - fetch from server
		log.info(
			`[PlaceRouteCompute] Cache miss for route ${employeeId}_${startPlaceId}_${endPlaceId}, fetching from server`
		);

		const response = await fetch('/api/routes/compute', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				employeeId,
				startPlaceId,
				endPlaceId
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
			log.error(
				`[PlaceRouteCompute] Failed to compute route: ${response.status} ${errorData.error || 'Unknown error'}`
			);
			return null;
		}

		const data = await response.json();

		if (!data.success) {
			log.warn(`[PlaceRouteCompute] Route computation failed: ${data.error || 'Unknown error'}`);
			return null;
		}

		// Store in cache
		await setPlaceRoute(
			employeeId,
			startPlaceId,
			endPlaceId,
			data.path,
			data.travelTimeSeconds,
			data.totalDistanceMeters,
			data.startLocation,
			data.endLocation
		);

		log.info(
			`[PlaceRouteCompute] Route computed and cached: ${employeeId}_${startPlaceId}_${endPlaceId}`
		);

		return {
			path: data.path,
			travelTimeSeconds: data.travelTimeSeconds,
			totalDistanceMeters: data.totalDistanceMeters,
			startLocation: data.startLocation,
			endLocation: data.endLocation
		};
	} catch (error) {
		log.error('[PlaceRouteCompute] Error computing place route:', error);
		return null;
	}
}
