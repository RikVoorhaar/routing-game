import type { RoutingResult } from '$lib/server/db/schema';

export function concatenateRoutes(route1: RoutingResult, route2: RoutingResult): RoutingResult {
	const concatPath = [...route1.path, ...route2.path];
	const concatDistance = route1.totalDistanceMeters + route2.totalDistanceMeters;

	return {
		path: concatPath,
		totalDistanceMeters: concatDistance,
		travelTimeSeconds: route1.travelTimeSeconds + route2.travelTimeSeconds,
		destination: route2.destination
	};
}

export function applyMaxSpeed(route: RoutingResult, maxSpeedKmh: number, timeMultiplier = 1.0): RoutingResult {
	// Create a deep copy of the route to avoid modifying the original
	const modifiedRoute: RoutingResult = {
		...route,
		path: route.path.map(point => ({
			...point,
			coordinates: { ...point.coordinates },
			cumulative_time_seconds: point.cumulative_time_seconds,
			cumulative_distance_meters: point.cumulative_distance_meters,
			max_speed_kmh: point.max_speed_kmh,
			is_walking_segment: point.is_walking_segment
		}))
	};

	let cumulativeTimeSeconds = 0;
	let cumulativeDistanceMeters = 0;
	
	// Process each path segment
	for (let i = 0; i < modifiedRoute.path.length; i++) {
		const point = modifiedRoute.path[i];
		
		// Skip walking segments as they are not affected by max speed
		if (point.is_walking_segment) {
			cumulativeTimeSeconds += point.cumulative_time_seconds - (i > 0 ? modifiedRoute.path[i-1].cumulative_time_seconds : 0);
			cumulativeDistanceMeters = point.cumulative_distance_meters;
			continue;
		}

		// Calculate the effective speed for this arc
		const originalSpeedKmh = point.max_speed_kmh;
		const effectiveSpeedKmh = Math.min(originalSpeedKmh, maxSpeedKmh);
		
		// Calculate the time for this segment
		const prevCumulativeTime = i > 0 ? modifiedRoute.path[i-1].cumulative_time_seconds : 0;
		let segmentTime = point.cumulative_time_seconds - prevCumulativeTime;
		
		// If we need to limit the speed, scale the time accordingly
		if (effectiveSpeedKmh < originalSpeedKmh) {
			segmentTime = segmentTime * (originalSpeedKmh / effectiveSpeedKmh);
		}
		
		// Apply the time multiplier
		segmentTime *= timeMultiplier;
		
		// Update cumulative values
		cumulativeTimeSeconds += segmentTime;
		cumulativeDistanceMeters = point.cumulative_distance_meters;
		
		// Update the point's data
		point.max_speed_kmh = effectiveSpeedKmh;
		point.cumulative_time_seconds = cumulativeTimeSeconds;
	}

	// Update the total travel time
	modifiedRoute.travelTimeSeconds = cumulativeTimeSeconds;
	modifiedRoute.totalDistanceMeters = cumulativeDistanceMeters;

	return modifiedRoute;
}
