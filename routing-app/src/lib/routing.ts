import { getRandomAddressInAnnulus } from './addresses';
import type { Coordinate, RoutingResult, PathPoint } from './types';
import http from 'http';

const ROUTING_SERVER_URL = 'http://localhost:8050';

// Reuse the same HTTP agent for connection pooling
const httpAgent = new http.Agent({
	keepAlive: true,
	keepAliveMsecs: 30000,
	maxSockets: 50,
	maxFreeSockets: 10
});

// Enhanced fetch with keep-alive agent
async function fetchWithKeepAlive(url: string, options: RequestInit = {}): Promise<Response> {
	return fetch(url, {
		...options,
		// @ts-expect-error - Node.js specific agent option
		agent: httpAgent
	});
}

interface ServerPathPoint {
	coordinates: { lat: number; lon: number };
	cumulative_time_seconds: number;
	cumulative_distance_meters: number;
	max_speed_kmh: number;
	is_walking_segment: boolean;
}

export async function getShortestPath(
	from: Coordinate,
	to: Coordinate,
	maxSpeed?: number
): Promise<RoutingResult> {
	let url = `${ROUTING_SERVER_URL}/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`;

	if (maxSpeed !== undefined && maxSpeed > 0) {
		url += `&max_speed=${maxSpeed}`;
	}

	const response = await fetchWithKeepAlive(url);

	if (!response.ok) {
		throw new Error(`Failed to get shortest path: ${response.statusText}`);
	}

	const data = await response.json();
	if (!data.success) {
		throw new Error(data.error || 'Failed to get shortest path ' + url);
	}

	// Convert the path to our PathPoint type
	const path: PathPoint[] = data.path.map((point: ServerPathPoint) => ({
		coordinates: { lat: point.coordinates.lat, lon: point.coordinates.lon },
		cumulative_time_seconds: point.cumulative_time_seconds,
		cumulative_distance_meters: point.cumulative_distance_meters,
		max_speed_kmh: point.max_speed_kmh,
		is_walking_segment: point.is_walking_segment
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
	const routingResult = await getShortestPath(from, destination, maxSpeed);

	// Preserve the full destination address information
	return {
		...routingResult,
		destination
	};
}
