import { describe, it, expect } from 'vitest';
import { applyMaxSpeed, concatenateRoutes } from './route-utils';
import { interpolateLocationAtTime } from './routing-client';
import type { RoutingResult } from '$lib/server/db/schema';

describe('route-utils applyMaxSpeed with interpolation', () => {
	it('should return end location when interpolating at durationSeconds after applying timeMultiplier', () => {
		// Create a simple route with known path points
		const originalRoute: RoutingResult = {
			path: [
				{
					coordinates: { lat: 52.0907, lon: 5.1214 },
					cumulative_time_seconds: 0,
					cumulative_distance_meters: 0,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0905, lon: 5.1212 },
					cumulative_time_seconds: 10,
					cumulative_distance_meters: 250,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0903, lon: 5.121 },
					cumulative_time_seconds: 20,
					cumulative_distance_meters: 500,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0901, lon: 5.1208 },
					cumulative_time_seconds: 30,
					cumulative_distance_meters: 750,
					max_speed_kmh: 50,
					is_walking_segment: false
				}
			],
			travelTimeSeconds: 30,
			totalDistanceMeters: 750,
			destination: { lat: 52.0901, lon: 5.1208 }
		};

		// Test with different time multipliers (speedups)
		const multipliers = [0.5, 0.75, 1.0, 1.25, 2.0];

		for (const multiplier of multipliers) {
			const modifiedRoute = applyMaxSpeed(originalRoute, 100, multiplier);
			const durationSeconds = modifiedRoute.travelTimeSeconds;
			const endLocation = modifiedRoute.path[modifiedRoute.path.length - 1].coordinates;

			// When we interpolate at durationSeconds, we should get the end location
			const interpolatedLocation = interpolateLocationAtTime(modifiedRoute.path, durationSeconds);

			expect(interpolatedLocation).not.toBeNull();
			if (interpolatedLocation) {
				// Check if the interpolated location matches the end location
				const latDiff = Math.abs(interpolatedLocation.lat - endLocation.lat);
				const lonDiff = Math.abs(interpolatedLocation.lon - endLocation.lon);

				// Allow for small floating point differences (1e-6 degrees ≈ 0.1 meters)
				const tolerance = 1e-6;

				if (latDiff > tolerance || lonDiff > tolerance) {
					console.error(`Multiplier ${multiplier}: Interpolation mismatch!`);
					console.error(`  Duration: ${durationSeconds}s`);
					console.error(`  Final path cumulative_time: ${modifiedRoute.path[modifiedRoute.path.length - 1].cumulative_time_seconds}s`);
					console.error(`  End location: (${endLocation.lat}, ${endLocation.lon})`);
					console.error(`  Interpolated location: (${interpolatedLocation.lat}, ${interpolatedLocation.lon})`);
					console.error(`  Difference: lat=${latDiff}, lon=${lonDiff}`);
				}

				expect(latDiff).toBeLessThan(tolerance);
				expect(lonDiff).toBeLessThan(tolerance);
			}
		}
	});

	it('should reproduce the bug: durationSeconds does not match final cumulative_time_seconds', () => {
		// Create a route with multiple segments
		const originalRoute: RoutingResult = {
			path: [
				{
					coordinates: { lat: 52.0907, lon: 5.1214 },
					cumulative_time_seconds: 0,
					cumulative_distance_meters: 0,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0906, lon: 5.1213 },
					cumulative_time_seconds: 5,
					cumulative_distance_meters: 125,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0905, lon: 5.1212 },
					cumulative_time_seconds: 10,
					cumulative_distance_meters: 250,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0903, lon: 5.121 },
					cumulative_time_seconds: 20,
					cumulative_distance_meters: 500,
					max_speed_kmh: 50,
					is_walking_segment: false
				}
			],
			travelTimeSeconds: 20,
			totalDistanceMeters: 500,
			destination: { lat: 52.0903, lon: 5.121 }
		};

		// Apply a speedup multiplier (e.g., 0.5 = 2x speed)
		const multiplier = 0.5;
		const modifiedRoute = applyMaxSpeed(originalRoute, 100, multiplier);

		const durationSeconds = modifiedRoute.travelTimeSeconds;
		const finalCumulativeTime = modifiedRoute.path[modifiedRoute.path.length - 1].cumulative_time_seconds;

		console.log('Route modification details:');
		console.log(`  Original travelTimeSeconds: ${originalRoute.travelTimeSeconds}`);
		console.log(`  Multiplier: ${multiplier}`);
		console.log(`  Modified travelTimeSeconds (durationSeconds): ${durationSeconds}`);
		console.log(`  Final path cumulative_time_seconds: ${finalCumulativeTime}`);
		console.log(`  Difference: ${Math.abs(durationSeconds - finalCumulativeTime)}`);

		// These should be equal, but they might not be due to floating point precision or calculation errors
		expect(Math.abs(durationSeconds - finalCumulativeTime)).toBeLessThan(0.001);

		// Test interpolation at durationSeconds
		const interpolatedLocation = interpolateLocationAtTime(modifiedRoute.path, durationSeconds);
		const endLocation = modifiedRoute.path[modifiedRoute.path.length - 1].coordinates;

		expect(interpolatedLocation).not.toBeNull();
		if (interpolatedLocation) {
			const latDiff = Math.abs(interpolatedLocation.lat - endLocation.lat);
			const lonDiff = Math.abs(interpolatedLocation.lon - endLocation.lon);

			console.log(`  End location: (${endLocation.lat}, ${endLocation.lon})`);
			console.log(`  Interpolated location: (${interpolatedLocation.lat}, ${interpolatedLocation.lon})`);
			console.log(`  Location difference: lat=${latDiff}, lon=${lonDiff}`);

			// This is the bug: the interpolated location should match the end location exactly
			const tolerance = 1e-6;
			if (latDiff > tolerance || lonDiff > tolerance) {
				console.error('BUG REPRODUCED: Interpolated location does not match end location!');
			}

			expect(latDiff).toBeLessThan(tolerance);
			expect(lonDiff).toBeLessThan(tolerance);
		}
	});

	it('should update walking segment cumulative_time_seconds correctly', () => {
		// This test checks if walking segments have their cumulative_time_seconds updated
		const originalRoute: RoutingResult = {
			path: [
				{
					coordinates: { lat: 52.0907, lon: 5.1214 },
					cumulative_time_seconds: 0,
					cumulative_distance_meters: 0,
					max_speed_kmh: 0,
					is_walking_segment: true
				},
				{
					coordinates: { lat: 52.0906, lon: 5.1213 },
					cumulative_time_seconds: 10,
					cumulative_distance_meters: 50,
					max_speed_kmh: 0,
					is_walking_segment: true
				},
				{
					coordinates: { lat: 52.0905, lon: 5.1212 },
					cumulative_time_seconds: 20,
					cumulative_distance_meters: 250,
					max_speed_kmh: 50,
					is_walking_segment: false
				}
			],
			travelTimeSeconds: 20,
			totalDistanceMeters: 250,
			destination: { lat: 52.0905, lon: 5.1212 }
		};

		const modifiedRoute = applyMaxSpeed(originalRoute, 100, 1.0);

		// Check that walking segments have updated cumulative_time_seconds
		console.log('Walking segment cumulative_time check:');
		modifiedRoute.path.forEach((point, i) => {
			console.log(`  Point ${i}: cumulative_time=${point.cumulative_time_seconds}, is_walking=${point.is_walking_segment}, original=${originalRoute.path[i].cumulative_time_seconds}`);
		});

		// The first walking segment should still be 0
		expect(modifiedRoute.path[0].cumulative_time_seconds).toBe(0);
		// The second walking segment should be updated to 10 (walking time from 0 to 10)
		expect(modifiedRoute.path[1].cumulative_time_seconds).toBe(10);
		// The driving segment should be updated based on calculations
		expect(modifiedRoute.path[2].cumulative_time_seconds).toBeGreaterThan(10);
	});

	it('should reproduce bug with walking segments and speed limits', () => {
		// Create a route with walking segments and speed limits
		const originalRoute: RoutingResult = {
			path: [
				{
					coordinates: { lat: 52.0907, lon: 5.1214 },
					cumulative_time_seconds: 0,
					cumulative_distance_meters: 0,
					max_speed_kmh: 0,
					is_walking_segment: true
				},
				{
					coordinates: { lat: 52.0906, lon: 5.1213 },
					cumulative_time_seconds: 10,
					cumulative_distance_meters: 50,
					max_speed_kmh: 0,
					is_walking_segment: true
				},
				{
					coordinates: { lat: 52.0905, lon: 5.1212 },
					cumulative_time_seconds: 20,
					cumulative_distance_meters: 250,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0903, lon: 5.121 },
					cumulative_time_seconds: 40,
					cumulative_distance_meters: 500,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0901, lon: 5.1208 },
					cumulative_time_seconds: 50,
					cumulative_distance_meters: 550,
					max_speed_kmh: 0,
					is_walking_segment: true
				}
			],
			travelTimeSeconds: 50,
			totalDistanceMeters: 550,
			destination: { lat: 52.0901, lon: 5.1208 }
		};

		// Apply max speed limit (30 km/h) and multiplier (0.5 = 2x speed)
		const maxSpeedKmh = 30;
		const multiplier = 0.5;
		const modifiedRoute = applyMaxSpeed(originalRoute, maxSpeedKmh, multiplier);

		const durationSeconds = modifiedRoute.travelTimeSeconds;
		const finalCumulativeTime = modifiedRoute.path[modifiedRoute.path.length - 1].cumulative_time_seconds;

		console.log('Route modification with walking segments:');
		console.log(`  Original travelTimeSeconds: ${originalRoute.travelTimeSeconds}`);
		console.log(`  Max speed: ${maxSpeedKmh} km/h`);
		console.log(`  Multiplier: ${multiplier}`);
		console.log(`  Modified travelTimeSeconds (durationSeconds): ${durationSeconds}`);
		console.log(`  Final path cumulative_time_seconds: ${finalCumulativeTime}`);
		console.log(`  Difference: ${Math.abs(durationSeconds - finalCumulativeTime)}`);

		// Print all path points for debugging
		console.log('Path points after modification:');
		modifiedRoute.path.forEach((point, i) => {
			console.log(`  Point ${i}: cumulative_time=${point.cumulative_time_seconds}, is_walking=${point.is_walking_segment}`);
		});

		// These should be equal
		expect(Math.abs(durationSeconds - finalCumulativeTime)).toBeLessThan(0.001);

		// Test interpolation at durationSeconds - should return end location
		const interpolatedLocation = interpolateLocationAtTime(modifiedRoute.path, durationSeconds);
		const endLocation = modifiedRoute.path[modifiedRoute.path.length - 1].coordinates;

		expect(interpolatedLocation).not.toBeNull();
		if (interpolatedLocation) {
			const latDiff = Math.abs(interpolatedLocation.lat - endLocation.lat);
			const lonDiff = Math.abs(interpolatedLocation.lon - endLocation.lon);

			console.log(`  End location: (${endLocation.lat}, ${endLocation.lon})`);
			console.log(`  Interpolated location: (${interpolatedLocation.lat}, ${interpolatedLocation.lon})`);
			console.log(`  Location difference: lat=${latDiff}, lon=${lonDiff}`);

			const tolerance = 1e-6;
			if (latDiff > tolerance || lonDiff > tolerance) {
				console.error('BUG REPRODUCED: Interpolated location does not match end location!');
			}

			expect(latDiff).toBeLessThan(tolerance);
			expect(lonDiff).toBeLessThan(tolerance);
		}
	});

	it('should reproduce bug: concatenateRoutes does not adjust cumulative_time_seconds', () => {
		// Create two routes to concatenate
		const route1: RoutingResult = {
			path: [
				{
					coordinates: { lat: 52.0907, lon: 5.1214 },
					cumulative_time_seconds: 0,
					cumulative_distance_meters: 0,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0905, lon: 5.1212 },
					cumulative_time_seconds: 10,
					cumulative_distance_meters: 250,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0903, lon: 5.121 },
					cumulative_time_seconds: 20,
					cumulative_distance_meters: 500,
					max_speed_kmh: 50,
					is_walking_segment: false
				}
			],
			travelTimeSeconds: 20,
			totalDistanceMeters: 500,
			destination: { lat: 52.0903, lon: 5.121 }
		};

		const route2: RoutingResult = {
			path: [
				{
					coordinates: { lat: 52.0903, lon: 5.121 },
					cumulative_time_seconds: 0,
					cumulative_distance_meters: 0,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0901, lon: 5.1208 },
					cumulative_time_seconds: 15,
					cumulative_distance_meters: 300,
					max_speed_kmh: 50,
					is_walking_segment: false
				},
				{
					coordinates: { lat: 52.0899, lon: 5.1206 },
					cumulative_time_seconds: 30,
					cumulative_distance_meters: 600,
					max_speed_kmh: 50,
					is_walking_segment: false
				}
			],
			travelTimeSeconds: 30,
			totalDistanceMeters: 600,
			destination: { lat: 52.0899, lon: 5.1206 }
		};

		const concatenated = concatenateRoutes(route1, route2);
		const totalDuration = concatenated.travelTimeSeconds; // Should be 20 + 30 = 50

		console.log('Concatenated route details:');
		console.log(`  Total duration: ${totalDuration}s`);
		console.log(`  Path length: ${concatenated.path.length}`);
		console.log('  Path points cumulative_time_seconds:');
		concatenated.path.forEach((point, i) => {
			console.log(`    Point ${i}: ${point.cumulative_time_seconds}s`);
		});

		// The bug: route2's cumulative times start from 0, not from route1's final time (20)
		// So the final point should have cumulative_time = 20 + 30 = 50
		const finalCumulativeTime = concatenated.path[concatenated.path.length - 1].cumulative_time_seconds;
		console.log(`  Final cumulative_time: ${finalCumulativeTime}s (should be ${totalDuration}s)`);

		// This is the bug - finalCumulativeTime is 30, not 50!
		if (finalCumulativeTime !== totalDuration) {
			console.error(`BUG REPRODUCED: Final cumulative_time (${finalCumulativeTime}) does not match total duration (${totalDuration})!`);
		}

		// Test interpolation at total duration - should return end location
		const interpolatedLocation = interpolateLocationAtTime(concatenated.path, totalDuration);
		const endLocation = concatenated.path[concatenated.path.length - 1].coordinates;

		expect(interpolatedLocation).not.toBeNull();
		if (interpolatedLocation) {
			const latDiff = Math.abs(interpolatedLocation.lat - endLocation.lat);
			const lonDiff = Math.abs(interpolatedLocation.lon - endLocation.lon);

			console.log(`  End location: (${endLocation.lat}, ${endLocation.lon})`);
			console.log(`  Interpolated at ${totalDuration}s: (${interpolatedLocation.lat}, ${interpolatedLocation.lon})`);
			console.log(`  Location difference: lat=${latDiff}, lon=${lonDiff}`);

			// This will fail because the path's cumulative times are wrong
			const tolerance = 1e-6;
			if (latDiff > tolerance || lonDiff > tolerance) {
				console.error('BUG REPRODUCED: Interpolated location does not match end location!');
			}

			expect(latDiff).toBeLessThan(tolerance);
			expect(lonDiff).toBeLessThan(tolerance);
		}
	});
});

