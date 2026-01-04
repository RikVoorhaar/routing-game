import type { RoutingResult } from '$lib/server/db/schema';

/**
 * @deprecated Use `/api/v1/complete_job_route` endpoint instead. This function will be removed in a future version.
 * The routing server now handles route concatenation server-side, avoiding the need for client-side manipulation.
 */
export function concatenateRoutes(route1: RoutingResult, route2: RoutingResult): RoutingResult {
	// Get the final cumulative time and distance from route1
	const route1FinalTime =
		route1.path.length > 0 ? route1.path[route1.path.length - 1].cumulative_time_seconds : 0;
	const route1FinalDistance =
		route1.path.length > 0 ? route1.path[route1.path.length - 1].cumulative_distance_meters : 0;

	// Adjust route2's path points to continue from route1's final values
	const adjustedRoute2Path = route2.path.map((point) => ({
		...point,
		cumulative_time_seconds: point.cumulative_time_seconds + route1FinalTime,
		cumulative_distance_meters: point.cumulative_distance_meters + route1FinalDistance
	}));

	const concatPath = [...route1.path, ...adjustedRoute2Path];
	const concatDistance = route1.totalDistanceMeters + route2.totalDistanceMeters;

	return {
		path: concatPath,
		totalDistanceMeters: concatDistance,
		travelTimeSeconds: route1.travelTimeSeconds + route2.travelTimeSeconds,
		destination: route2.destination
	};
}

/**
 * @deprecated Use `/api/v1/complete_job_route` endpoint instead. This function will be removed in a future version.
 * The routing server now handles speed limiting and multiplier application server-side, avoiding the need for client-side manipulation.
 */
export function applyMaxSpeed(
	route: RoutingResult,
	maxSpeedKmh: number,
	timeMultiplier = 1.0
): RoutingResult {
	// Create a deep copy of the route to avoid modifying the original
	const modifiedRoute: RoutingResult = {
		...route,
		path: route.path.map((point) => ({
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

		// Handle walking segments - apply multiplier but not max speed limits
		if (point.is_walking_segment) {
			// Use original cumulative times to calculate segment time
			const prevOriginalCumulativeTime = i > 0 ? route.path[i - 1].cumulative_time_seconds : 0;
			const currentOriginalCumulativeTime = route.path[i].cumulative_time_seconds;
			let segmentTime = currentOriginalCumulativeTime - prevOriginalCumulativeTime;

			// Apply the time multiplier to walking segments as well
			segmentTime *= timeMultiplier;

			cumulativeTimeSeconds += segmentTime;
			cumulativeDistanceMeters = point.cumulative_distance_meters;
			// Update the point's cumulative time to match our calculated value
			point.cumulative_time_seconds = cumulativeTimeSeconds;
			continue;
		}

		// Calculate the effective speed for this arc
		const originalSpeedKmh = point.max_speed_kmh;
		const effectiveSpeedKmh = Math.min(originalSpeedKmh, maxSpeedKmh);

		// Calculate the time for this segment using ORIGINAL route cumulative times
		// This ensures we get the correct segment duration before applying modifications
		const prevOriginalCumulativeTime = i > 0 ? route.path[i - 1].cumulative_time_seconds : 0;
		const currentOriginalCumulativeTime = route.path[i].cumulative_time_seconds;
		let segmentTime = currentOriginalCumulativeTime - prevOriginalCumulativeTime;

		// If we need to limit the speed, scale the time accordingly
		if (effectiveSpeedKmh < originalSpeedKmh) {
			segmentTime = segmentTime * (originalSpeedKmh / effectiveSpeedKmh);
		}

		// Apply the time multiplier (e.g., 0.1 = 10x faster)
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
