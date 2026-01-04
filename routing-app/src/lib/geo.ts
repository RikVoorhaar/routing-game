import * as turf from '@turf/turf';
import type { Coordinate } from '$lib/server/db/schema';

/**
 * Calculate the geodesic distance between two points in kilometers
 */
export function distance(point1: Coordinate, point2: Coordinate): number {
	const from = turf.point([point1.lon, point1.lat]);
	const to = turf.point([point2.lon, point2.lat]);
	return turf.distance(from, to, { units: 'kilometers' });
}

/**
 * Generate a random point within an annulus (ring) around a center point
 * @param center Center point of the annulus
 * @param minDistance Minimum distance from center in kilometers
 * @param maxDistance Maximum distance from center in kilometers
 * @returns Random point within the annulus
 * @throws Error if distances are invalid (negative or min > max)
 */
export function randomCoordinateInAnnulus(
	center: Coordinate,
	minDistance: number,
	maxDistance: number
): Coordinate {
	// Validate inputs
	if (minDistance < 0) {
		throw new Error('Minimum distance cannot be negative');
	}
	if (maxDistance <= minDistance) {
		throw new Error('Maximum distance must be greater than minimum distance');
	}

	// Generate random angle (bearing) and distance
	const bearing = Math.random() * 360; // Random bearing in degrees
	const distance = Math.sqrt(
		Math.random() * (maxDistance * maxDistance - minDistance * minDistance) +
			minDistance * minDistance
	);

	// Use turf.destination to calculate the new point
	const from = turf.point([center.lon, center.lat]);
	const destination = turf.destination(from, distance, bearing, { units: 'kilometers' });

	return {
		lat: destination.geometry.coordinates[1],
		lon: destination.geometry.coordinates[0]
	};
}
