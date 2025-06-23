import type { PathPoint } from '$lib/server/db/schema';
import * as turf from '@turf/turf';

/**
 * Interpolate location along a path based on travel time
 * @param path Array of path points with coordinates and cumulative times
 * @param timeSeconds Target time in seconds
 * @returns Interpolated coordinates at the given time, or null if time is out of range
 */
export function interpolateLocationAtTime(
	path: PathPoint[],
	time: number
): { lat: number; lon: number } | null {
	if (path.length === 0) {
		return null;
	}
	// Single-point path: always return that point
	if (path.length === 1) {
		return {
			lat: path[0].coordinates.lat,
			lon: path[0].coordinates.lon
		};
	}
	// If time is before or at the first point, return the first point
	if (time <= path[0].cumulative_time_seconds) {
		return {
			lat: path[0].coordinates.lat,
			lon: path[0].coordinates.lon
		};
	}
	// If time is after the last point, return the last point
	if (time >= path[path.length - 1].cumulative_time_seconds) {
		return {
			lat: path[path.length - 1].coordinates.lat,
			lon: path[path.length - 1].coordinates.lon
		};
	}
	// Find the two points to interpolate between
	let startPoint = path[0];
	let endPoint = path[1];
	for (let i = 1; i < path.length; i++) {
		if (path[i].cumulative_time_seconds >= time) {
			startPoint = path[i - 1];
			endPoint = path[i];
			break;
		}
	}
	// If we found an exact match, return that point
	if (startPoint.cumulative_time_seconds === time) {
		return {
			lat: startPoint.coordinates.lat,
			lon: startPoint.coordinates.lon
		};
	}
	if (endPoint.cumulative_time_seconds === time) {
		return {
			lat: endPoint.coordinates.lat,
			lon: endPoint.coordinates.lon
		};
	}
	// If the two points are the same, return either
	if (
		startPoint.coordinates.lat === endPoint.coordinates.lat &&
		startPoint.coordinates.lon === endPoint.coordinates.lon
	) {
		return {
			lat: startPoint.coordinates.lat,
			lon: startPoint.coordinates.lon
		};
	}
	// Calculate the fraction of time between the two points
	const timeFraction =
		(time - startPoint.cumulative_time_seconds) /
		(endPoint.cumulative_time_seconds - startPoint.cumulative_time_seconds);
	// Create a line between the two points
	const line = turf.lineString([
		[startPoint.coordinates.lon, startPoint.coordinates.lat],
		[endPoint.coordinates.lon, endPoint.coordinates.lat]
	]);
	// Use turf.along to find the interpolated point
	const lineLength = turf.length(line);
	if (lineLength === 0) {
		return {
			lat: startPoint.coordinates.lat,
			lon: startPoint.coordinates.lon
		};
	}
	const interpolatedPoint = turf.along(line, timeFraction * lineLength);
	return {
		lat: interpolatedPoint.geometry.coordinates[1],
		lon: interpolatedPoint.geometry.coordinates[0]
	};
}

