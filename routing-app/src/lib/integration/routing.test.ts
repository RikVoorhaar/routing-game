import { describe, it, expect, beforeAll } from 'vitest';
import { getRandomRouteInAnnulus } from '../routes/routing';
import { getServerHealth } from '../server';
import { interpolateLocationAtTime } from '../routes/routing-client';
import type { Coordinate, PathPoint } from '../types';

describe('routing functions (integration)', () => {
	beforeAll(async () => {
		// Check if server is running
		try {
			const health = await getServerHealth();
			expect(health.status).toBe('ok');
			expect(health.engine_initialized).toBe(true);
		} catch {
			throw new Error('Routing server is not running. Please start it before running these tests.');
		}
	});

	describe('cumulative time bug reproduction', () => {
		it('should have total travel time match the final path point cumulative time', async () => {
			// Test multiple routes to see if there's a consistent pattern
			const testRoutes = [
				{ from: { lat: 52.0907, lon: 5.1214 }, to: { lat: 52.09, lon: 5.12 } },
				{ from: { lat: 52.0907, lon: 5.1214 }, to: { lat: 52.092, lon: 5.123 } },
				{ from: { lat: 52.09, lon: 5.12 }, to: { lat: 52.091, lon: 5.122 } }
			];

			for (const route of testRoutes) {
				const response = await fetch(
					`http://localhost:8050/api/v1/shortest_path?from=${route.from.lat},${route.from.lon}&to=${route.to.lat},${route.to.lon}`
				);

				expect(response.ok).toBe(true);
				const data = await response.json();
				expect(data.success).toBe(true);

				if (data.path && data.path.length > 0) {
					const finalPoint = data.path[data.path.length - 1];
					const totalTravelTimeSeconds = data.travel_time_seconds;
					const finalCumulativeTime = finalPoint.cumulative_time_seconds;

					console.log(
						`Route from (${route.from.lat}, ${route.from.lon}) to (${route.to.lat}, ${route.to.lon}):`
					);
					console.log(`  Total travel time: ${totalTravelTimeSeconds}s`);
					console.log(`  Final cumulative time: ${finalCumulativeTime}s`);
					console.log(`  Difference: ${Math.abs(totalTravelTimeSeconds - finalCumulativeTime)}s`);

					// BUG REPRODUCTION: The total travel time should match the final cumulative time
					// This may fail due to the bug where begin/end walking segments are not included
					expect(Math.abs(totalTravelTimeSeconds - finalCumulativeTime)).toBeLessThan(0.1); // Allow for small rounding differences
				}
			}
		});

		it('should have total travel time match cumulative time WITH maxSpeed parameter', async () => {
			// Test the same routes but with maxSpeed parameter - this might be where the bug manifests
			const testRoutes = [
				{ from: { lat: 52.0907, lon: 5.1214 }, to: { lat: 52.09, lon: 5.12 } },
				{ from: { lat: 52.0907, lon: 5.1214 }, to: { lat: 52.092, lon: 5.123 } },
				{ from: { lat: 52.09, lon: 5.12 }, to: { lat: 52.091, lon: 5.122 } }
			];

			const maxSpeeds = [20, 30, 15]; // Different speed limits to test

			for (let i = 0; i < testRoutes.length; i++) {
				const route = testRoutes[i];
				const maxSpeed = maxSpeeds[i];

				const response = await fetch(
					`http://localhost:8050/api/v1/shortest_path?from=${route.from.lat},${route.from.lon}&to=${route.to.lat},${route.to.lon}&max_speed=${maxSpeed}`
				);

				expect(response.ok).toBe(true);
				const data = await response.json();
				expect(data.success).toBe(true);

				if (data.path && data.path.length > 0) {
					const finalPoint = data.path[data.path.length - 1];
					const totalTravelTimeSeconds = data.travel_time_seconds;
					const finalCumulativeTime = finalPoint.cumulative_time_seconds;

					console.log(
						`Route from (${route.from.lat}, ${route.from.lon}) to (${route.to.lat}, ${route.to.lon}) with maxSpeed=${maxSpeed}:`
					);
					console.log(`  Total travel time: ${totalTravelTimeSeconds}s`);
					console.log(`  Final cumulative time: ${finalCumulativeTime}s`);
					console.log(`  Difference: ${Math.abs(totalTravelTimeSeconds - finalCumulativeTime)}s`);

					// BUG REPRODUCTION: This is where the bug might manifest with maxSpeed
					// The total travel time should still match the final cumulative time even with maxSpeed
					expect(Math.abs(totalTravelTimeSeconds - finalCumulativeTime)).toBeLessThan(0.1);
				}
			}
		});

		it('should have interpolated position reach destination with maxSpeed parameter', async () => {
			// Test interpolation with maxSpeed to see if the position lags behind
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const to: Coordinate = { lat: 52.092, lon: 5.123 };
			const maxSpeed = 20;

			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}&max_speed=${maxSpeed}`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();
			expect(data.success).toBe(true);

			const path: PathPoint[] = data.path.map((point: any) => ({
				coordinates: { lat: point.coordinates.lat, lon: point.coordinates.lon },
				cumulative_time_seconds: point.cumulative_time_seconds,
				cumulative_distance_meters: point.cumulative_distance_meters,
				max_speed_kmh: point.max_speed_kmh,
				is_walking_segment: point.is_walking_segment
			}));

			const totalTravelTime = data.travel_time_seconds;
			const finalCumulativeTime = path[path.length - 1].cumulative_time_seconds;

			// Interpolate at the total travel time - this should give us the destination
			const interpolatedAtEnd = interpolateLocationAtTime(path, totalTravelTime);

			console.log(`Route with maxSpeed=${maxSpeed}:`);
			console.log(`  Total travel time: ${totalTravelTime}s`);
			console.log(`  Final cumulative time: ${finalCumulativeTime}s`);
			console.log(`  Time difference: ${Math.abs(totalTravelTime - finalCumulativeTime)}s`);
			console.log(`  Destination: (${to.lat}, ${to.lon})`);
			console.log(
				`  Final path point: (${path[path.length - 1].coordinates.lat}, ${path[path.length - 1].coordinates.lon})`
			);
			console.log(
				`  Interpolated at total travel time: (${interpolatedAtEnd?.lat}, ${interpolatedAtEnd?.lon})`
			);

			expect(interpolatedAtEnd).not.toBeNull();

			if (interpolatedAtEnd) {
				// BUG REPRODUCTION: With maxSpeed, the interpolated position might lag behind
				const distanceToDestination = Math.sqrt(
					Math.pow(interpolatedAtEnd.lat - to.lat, 2) + Math.pow(interpolatedAtEnd.lon - to.lon, 2)
				);

				console.log(
					`  Distance from interpolated to destination: ${distanceToDestination * 111000}m`
				);

				// Check if interpolated position reaches destination when using maxSpeed
				// This test might fail if there's a bug with maxSpeed cumulative time calculation
				expect(distanceToDestination * 111000).toBeLessThan(50);
			}
		});

		it('should compare routes with and without maxSpeed to isolate the bug', async () => {
			// Test the same route with and without maxSpeed to see where the difference occurs
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const to: Coordinate = { lat: 52.092, lon: 5.123 };

			// Route without maxSpeed
			const responseNoLimit = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
			);
			expect(responseNoLimit.ok).toBe(true);
			const dataNoLimit = await responseNoLimit.json();

			// Route with maxSpeed
			const responseWithLimit = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}&max_speed=20`
			);
			expect(responseWithLimit.ok).toBe(true);
			const dataWithLimit = await responseWithLimit.json();

			console.log('Route comparison:');
			console.log('  Without maxSpeed:');
			console.log(`    Total travel time: ${dataNoLimit.travel_time_seconds}s`);
			console.log(
				`    Final cumulative time: ${dataNoLimit.path[dataNoLimit.path.length - 1].cumulative_time_seconds}s`
			);
			console.log(
				`    Difference: ${Math.abs(dataNoLimit.travel_time_seconds - dataNoLimit.path[dataNoLimit.path.length - 1].cumulative_time_seconds)}s`
			);

			console.log('  With maxSpeed=20:');
			console.log(`    Total travel time: ${dataWithLimit.travel_time_seconds}s`);
			console.log(
				`    Final cumulative time: ${dataWithLimit.path[dataWithLimit.path.length - 1].cumulative_time_seconds}s`
			);
			console.log(
				`    Difference: ${Math.abs(dataWithLimit.travel_time_seconds - dataWithLimit.path[dataWithLimit.path.length - 1].cumulative_time_seconds)}s`
			);

			// Both should have matching times
			expect(
				Math.abs(
					dataNoLimit.travel_time_seconds -
						dataNoLimit.path[dataNoLimit.path.length - 1].cumulative_time_seconds
				)
			).toBeLessThan(0.1);
			expect(
				Math.abs(
					dataWithLimit.travel_time_seconds -
						dataWithLimit.path[dataWithLimit.path.length - 1].cumulative_time_seconds
				)
			).toBeLessThan(0.1);
		});

		it('should have interpolated position reach the destination when using travel time', async () => {
			// Test a route and verify that interpolating at the total travel time gives us the destination
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const to: Coordinate = { lat: 52.092, lon: 5.123 };

			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();
			expect(data.success).toBe(true);

			const path: PathPoint[] = data.path.map((point: any) => ({
				coordinates: { lat: point.coordinates.lat, lon: point.coordinates.lon },
				cumulative_time_seconds: point.cumulative_time_seconds,
				cumulative_distance_meters: point.cumulative_distance_meters,
				max_speed_kmh: point.max_speed_kmh,
				is_walking_segment: point.is_walking_segment
			}));

			const totalTravelTime = data.travel_time_seconds;

			// Interpolate at the total travel time - this should give us the destination
			const interpolatedAtEnd = interpolateLocationAtTime(path, totalTravelTime);

			console.log('Route details:');
			console.log(`  Total travel time: ${totalTravelTime}s`);
			console.log(`  Final point time: ${path[path.length - 1].cumulative_time_seconds}s`);
			console.log(`  Destination: (${to.lat}, ${to.lon})`);
			console.log(
				`  Final path point: (${path[path.length - 1].coordinates.lat}, ${path[path.length - 1].coordinates.lon})`
			);
			console.log(`  Interpolated at end: (${interpolatedAtEnd?.lat}, ${interpolatedAtEnd?.lon})`);

			expect(interpolatedAtEnd).not.toBeNull();

			if (interpolatedAtEnd) {
				// BUG REPRODUCTION: The interpolated position at total travel time should be very close to the destination
				// This may fail if the cumulative times don't account for walking segments properly
				const distanceToDestination = Math.sqrt(
					Math.pow(interpolatedAtEnd.lat - to.lat, 2) + Math.pow(interpolatedAtEnd.lon - to.lon, 2)
				);

				console.log(
					`  Distance from interpolated to destination: ${distanceToDestination * 111000}m`
				);

				// Should be very close to the destination (within 50 meters)
				expect(distanceToDestination * 111000).toBeLessThan(50);
			}
		});

		it('should have walking segments properly included in cumulative time calculation', async () => {
			// Test a route that definitely has walking segments (coordinates not exactly on road network)
			const from: Coordinate = { lat: 52.090234, lon: 5.121678 }; // Slightly off-road
			const to: Coordinate = { lat: 52.091456, lon: 5.12289 }; // Slightly off-road

			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();
			expect(data.success).toBe(true);

			console.log('Route with walking segments:');
			console.log(`  Path length: ${data.path.length} points`);

			// Check for walking segments in the path
			let hasWalkingSegments = false;
			let walkingSegmentCount = 0;

			data.path.forEach((point: any, index: number) => {
				if (point.is_walking_segment) {
					hasWalkingSegments = true;
					walkingSegmentCount++;
					console.log(
						`  Point ${index}: Walking segment at (${point.coordinates.lat}, ${point.coordinates.lon}), time: ${point.cumulative_time_seconds}s`
					);
				} else {
					console.log(
						`  Point ${index}: Road segment at (${point.coordinates.lat}, ${point.coordinates.lon}), time: ${point.cumulative_time_seconds}s`
					);
				}
			});

			console.log(`  Has walking segments: ${hasWalkingSegments}`);
			console.log(`  Walking segment count: ${walkingSegmentCount}`);
			console.log(`  Total travel time: ${data.travel_time_seconds}s`);
			console.log(
				`  Final cumulative time: ${data.path[data.path.length - 1].cumulative_time_seconds}s`
			);

			// Verify that walking segments are included in cumulative time
			if (hasWalkingSegments) {
				// The cumulative times should increase properly through walking segments
				for (let i = 1; i < data.path.length; i++) {
					const prevTime = data.path[i - 1].cumulative_time_seconds;
					const currTime = data.path[i].cumulative_time_seconds;

					// Time should never decrease
					expect(currTime).toBeGreaterThanOrEqual(prevTime);

					// If current point is a walking segment, there should be some time added
					if (data.path[i].is_walking_segment && i > 0) {
						expect(currTime).toBeGreaterThan(prevTime);
					}
				}
			}
		});

		it('should handle very short routes correctly', async () => {
			// Test a very short route to see if time calculation is correct for minimal walking
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const to: Coordinate = { lat: 52.0907, lon: 5.1215 }; // Very close

			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();
			expect(data.success).toBe(true);

			console.log('Very short route:');
			console.log(`  Distance: ${data.total_distance_meters}m`);
			console.log(`  Travel time: ${data.travel_time_seconds}s`);
			console.log(`  Path points: ${data.path.length}`);

			// Even for very short routes, the travel time should be reasonable
			expect(data.travel_time_seconds).toBeGreaterThan(0);
			expect(data.travel_time_seconds).toBeLessThan(300); // Should be less than 5 minutes

			// And the final cumulative time should match
			const finalCumulativeTime = data.path[data.path.length - 1].cumulative_time_seconds;
			expect(Math.abs(data.travel_time_seconds - finalCumulativeTime)).toBeLessThan(0.1);
		});
	});

	describe('getRandomRouteInAnnulus', () => {
		it('returns a valid route within the specified annulus', async () => {
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const minDistance = 0.5; // 500m
			const maxDistance = 1.0; // 1km

			const routeInAnnulus = await getRandomRouteInAnnulus(from, minDistance, maxDistance);

			// Check route structure
			expect(routeInAnnulus).toHaveProperty('route');
			expect(routeInAnnulus).toHaveProperty('destination');
			expect(routeInAnnulus.route).toHaveProperty('path');
			expect(routeInAnnulus.route).toHaveProperty('travelTimeSeconds');
			expect(routeInAnnulus.route).toHaveProperty('totalDistanceMeters');

			// Check path
			expect(Array.isArray(routeInAnnulus.route.path)).toBe(true);
			expect(routeInAnnulus.route.path.length).toBeGreaterThan(0);
			routeInAnnulus.route.path.forEach((point) => {
				expect(point).toHaveProperty('coordinates');
				expect(point.coordinates).toHaveProperty('lat');
				expect(point.coordinates).toHaveProperty('lon');
				expect(point).toHaveProperty('cumulative_time_seconds');
				expect(point).toHaveProperty('cumulative_distance_meters');
				expect(point).toHaveProperty('max_speed_kmh');
				expect(point).toHaveProperty('is_walking_segment');
				expect(typeof point.coordinates.lat).toBe('number');
				expect(typeof point.coordinates.lon).toBe('number');
				expect(typeof point.cumulative_time_seconds).toBe('number');
				expect(typeof point.cumulative_distance_meters).toBe('number');
				expect(typeof point.max_speed_kmh).toBe('number');
				expect(typeof point.is_walking_segment).toBe('boolean');
			});

			// Check travel time
			expect(typeof routeInAnnulus.route.travelTimeSeconds).toBe('number');
			expect(routeInAnnulus.route.travelTimeSeconds).toBeGreaterThan(0);

			// Check total distance
			expect(typeof routeInAnnulus.route.totalDistanceMeters).toBe('number');
			expect(routeInAnnulus.route.totalDistanceMeters).toBeGreaterThan(0);

			// Check destination
			expect(routeInAnnulus.destination).toHaveProperty('id');
			expect(routeInAnnulus.destination).toHaveProperty('lat');
			expect(routeInAnnulus.destination).toHaveProperty('lon');

			// Check that destination is within reasonable bounds
			expect(routeInAnnulus.destination.lat).toBeGreaterThan(from.lat - 0.1);
			expect(routeInAnnulus.destination.lat).toBeLessThan(from.lat + 0.1);
			expect(routeInAnnulus.destination.lon).toBeGreaterThan(from.lon - 0.1);
			expect(routeInAnnulus.destination.lon).toBeLessThan(from.lon + 0.1);
		});

		it('handles larger distances', async () => {
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const minDistance = 2.0; // 2km
			const maxDistance = 3.0; // 3km

			const routeInAnnulus = await getRandomRouteInAnnulus(from, minDistance, maxDistance);

			expect(routeInAnnulus).toHaveProperty('route');
			expect(routeInAnnulus).toHaveProperty('destination');
			expect(routeInAnnulus.route).toHaveProperty('path');
			expect(routeInAnnulus.route).toHaveProperty('travelTimeSeconds');
			expect(routeInAnnulus.route).toHaveProperty('totalDistanceMeters');
			expect(routeInAnnulus.route.path.length).toBeGreaterThan(0);
		});

		it('respects max speed parameter', async () => {
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const minDistance = 0.5; // 500m
			const maxDistance = 1.0; // 1km
			const maxSpeed = 20; // 20 km/h

			const routeInAnnulus = await getRandomRouteInAnnulus(
				from,
				minDistance,
				maxDistance,
				maxSpeed
			);

			expect(routeInAnnulus).toHaveProperty('route');
			expect(routeInAnnulus.route).toHaveProperty('path');
			expect(routeInAnnulus.route.path.length).toBeGreaterThan(0);

			// Check that all max_speed_kmh values are at or below the limit (except for walking segments and starting point)
			routeInAnnulus.route.path.forEach((point, index) => {
				if (point.is_walking_segment) {
					expect(point.max_speed_kmh).toBe(6); // Walking segments are always 6 km/h
				} else if (index === 0 && !point.is_walking_segment) {
					// First non-walking point might have 0 or 6 depending on if there's a walking segment before it
					expect(point.max_speed_kmh).toBeGreaterThanOrEqual(0);
				} else {
					expect(point.max_speed_kmh).toBeLessThanOrEqual(maxSpeed);
				}
			});
		});

		it('throws error for invalid distances', async () => {
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };

			await expect(getRandomRouteInAnnulus(from, -1, 1)).rejects.toThrow();
			await expect(getRandomRouteInAnnulus(from, 2, 1)).rejects.toThrow();
		});

		it('handles previously problematic route that required custom profile', async () => {
			// This specific route wasn't working before the custom profile implementation
			const from: Coordinate = { lat: 52.0907618944552, lon: 5.1211182687520695 };
			const to: Coordinate = { lat: 52.092416, lon: 5.118118 };

			// Make a direct routing request to test the specific route
			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();

			// Should now work with custom profile
			expect(data.success).toBe(true);
			expect(data).toHaveProperty('path');
			expect(data).toHaveProperty('travel_time_seconds');
			expect(data).toHaveProperty('total_distance_meters');

			expect(Array.isArray(data.path)).toBe(true);
			expect(data.path.length).toBeGreaterThan(0);
			expect(data.travel_time_seconds).toBeGreaterThan(0);
			expect(data.total_distance_meters).toBeGreaterThan(0);

			// Verify path structure matches new API
			data.path.forEach((point: any) => {
				expect(point).toHaveProperty('coordinates');
				expect(point.coordinates).toHaveProperty('lat');
				expect(point.coordinates).toHaveProperty('lon');
				expect(point).toHaveProperty('cumulative_time_seconds');
				expect(point).toHaveProperty('cumulative_distance_meters');
				expect(point).toHaveProperty('max_speed_kmh');
				expect(point).toHaveProperty('is_walking_segment');
			});
		});

		it('handles the originally failing route with trimmed OSM data', async () => {
			// This is the route that was failing due to disconnected components
			const from: Coordinate = { lat: 52.09082916316217, lon: 5.12112919278711 };
			const to: Coordinate = { lat: 52.095032, lon: 5.121974 };

			// Make a direct routing request with max speed
			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}&max_speed=20`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();

			// Should now work with trimmed OSM data (only largest connected component)
			expect(data.success).toBe(true);
			expect(data).toHaveProperty('path');
			expect(data).toHaveProperty('travel_time_seconds');
			expect(data).toHaveProperty('total_distance_meters');

			expect(Array.isArray(data.path)).toBe(true);
			expect(data.path.length).toBeGreaterThan(0);
			expect(data.travel_time_seconds).toBeGreaterThan(0);
			expect(data.total_distance_meters).toBeGreaterThan(0);

			// Verify path structure
			data.path.forEach((point: any) => {
				expect(point).toHaveProperty('coordinates');
				expect(point.coordinates).toHaveProperty('lat');
				expect(point.coordinates).toHaveProperty('lon');
				expect(point).toHaveProperty('cumulative_time_seconds');
				expect(point).toHaveProperty('cumulative_distance_meters');
				expect(point).toHaveProperty('max_speed_kmh');
				expect(point).toHaveProperty('is_walking_segment');
			});

			// Verify max speed is respected
			data.path.forEach((point: any, index: number) => {
				if (point.is_walking_segment) {
					expect(point.max_speed_kmh).toBe(6); // Walking segments are always 6 km/h
				} else if (index === 0 && !point.is_walking_segment) {
					// First non-walking point might have 0 or 6 depending on walking segments
					expect(point.max_speed_kmh).toBeGreaterThanOrEqual(0);
				} else {
					expect(point.max_speed_kmh).toBeLessThanOrEqual(20);
				}
			});
		});

		it('handles very close coordinates with fallback mechanism', async () => {
			// Test coordinates that are very close but map to disconnected nodes
			const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const to: Coordinate = { lat: 52.0908, lon: 5.1215 };

			// Make a direct routing request
			const response = await fetch(
				`http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
			);

			expect(response.ok).toBe(true);
			const data = await response.json();

			// Should succeed with real routing (improved behavior with trimmed OSM data)
			expect(data.success).toBe(true);
			expect(data).toHaveProperty('path');
			expect(data).toHaveProperty('travel_time_seconds');
			expect(data).toHaveProperty('total_distance_meters');

			// Should have a real route (not fallback behavior anymore)
			expect(Array.isArray(data.path)).toBe(true);
			expect(data.path.length).toBeGreaterThanOrEqual(1);
			expect(data.travel_time_seconds).toBeGreaterThan(0);
			expect(data.total_distance_meters).toBeGreaterThan(0);
			expect(data.total_distance_meters).toBeLessThan(100); // Should be very short distance

			// Verify the route structure
			data.path.forEach((point: any) => {
				expect(point).toHaveProperty('coordinates');
				expect(point.coordinates).toHaveProperty('lat');
				expect(point.coordinates).toHaveProperty('lon');
				expect(point).toHaveProperty('cumulative_time_seconds');
				expect(point).toHaveProperty('cumulative_distance_meters');
				expect(point).toHaveProperty('max_speed_kmh');
				expect(point).toHaveProperty('is_walking_segment');
			});
		});
	});
});
