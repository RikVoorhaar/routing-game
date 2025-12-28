import * as turf from '@turf/turf';
import type { Coordinate } from '$lib/server/db/schema';

export interface TileBounds {
	north: number;
	south: number;
	east: number;
	west: number;
}

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

/**
 * Get the geographic bounds (min/max lon/lat) of a given tile
 * @param x Tile X coordinate
 * @param y Tile Y coordinate
 * @param z Zoom level
 * @returns Geographic bounds of the tile
 */
export function getTileBounds(x: number, y: number, z: number): TileBounds {
	const n = Math.pow(2, z);

	// Calculate longitude bounds
	const west = (x / n) * 360 - 180;
	const east = ((x + 1) / n) * 360 - 180;

	// Calculate latitude bounds using Web Mercator projection
	const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
	const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;

	return {
		north,
		south,
		east,
		west
	};
}
