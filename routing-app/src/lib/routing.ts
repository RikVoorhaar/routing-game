import { getRandomAddressInAnnulus } from './addresses';
import type { Coordinate, RoutingResult, PathPoint } from './types';
import * as turf from '@turf/turf';

const ROUTING_SERVER_URL = 'http://localhost:8050';

interface ServerPathPoint {
    coordinates: { lat: number; lon: number };
    cumulative_time_seconds: number;
    cumulative_distance_meters: number;
    max_speed_kmh: number;
}

/**
 * Interpolate location along a path based on travel time
 * @param path Array of path points with coordinates and cumulative times
 * @param timeSeconds Target time in seconds
 * @returns Interpolated coordinates at the given time, or null if time is out of range
 */
export function interpolateLocationAtTime(path: PathPoint[], time: number): { lat: number; lon: number } | null {
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
    if (startPoint.coordinates.lat === endPoint.coordinates.lat && startPoint.coordinates.lon === endPoint.coordinates.lon) {
        return {
            lat: startPoint.coordinates.lat,
            lon: startPoint.coordinates.lon
        };
    }
    // Calculate the fraction of time between the two points
    const timeFraction = (time - startPoint.cumulative_time_seconds) / (endPoint.cumulative_time_seconds - startPoint.cumulative_time_seconds);
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

async function getShortestPath(from: Coordinate, to: Coordinate, maxSpeed?: number): Promise<RoutingResult> {
    let url = `${ROUTING_SERVER_URL}/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`;
    
    if (maxSpeed !== undefined && maxSpeed > 0) {
        url += `&max_speed=${maxSpeed}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to get shortest path: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Failed to get shortest path');
    }

    // Convert the path to our PathPoint type
    const path: PathPoint[] = data.path.map((point: ServerPathPoint) => ({
        coordinates: { lat: point.coordinates.lat, lon: point.coordinates.lon },
        cumulative_time_seconds: point.cumulative_time_seconds,
        cumulative_distance_meters: point.cumulative_distance_meters,
        max_speed_kmh: point.max_speed_kmh
    }));

    return {
        path,
        travelTimeSeconds: data.travel_time_seconds,
        totalDistanceMeters: data.total_distance_meters,
        destination: {
            id: data.destination_id,
            lat: to.lat,
            lon: to.lon
        }
    };
}

export async function getRandomRouteInAnnulus(
    from: Coordinate,
    minDistance: number,
    maxDistance: number,
    maxSpeed?: number
): Promise<RoutingResult> {
    // Get a random destination address in the annulus
    const destination = await getRandomAddressInAnnulus(from, minDistance, maxDistance);
    
    // Get the route to that destination
    return getShortestPath(from, destination, maxSpeed);
} 