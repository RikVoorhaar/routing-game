import { getRandomAddressInAnnulus } from './addresses';
import type { Coordinate, RoutingResult } from './types';

const ROUTING_SERVER_URL = 'http://localhost:8050';

async function getShortestPath(from: Coordinate, to: Coordinate): Promise<RoutingResult> {
    const response = await fetch(
        `${ROUTING_SERVER_URL}/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
    );

    if (!response.ok) {
        throw new Error(`Failed to get shortest path: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error || 'Failed to get shortest path');
    }

    // Convert the path to our Coordinate type
    const path = data.path.map((point: [number, number]) => point);

    return {
        path,
        travelTimeSeconds: data.travel_time_seconds,
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
    maxDistance: number
): Promise<RoutingResult> {
    // Get a random destination address in the annulus
    const destination = await getRandomAddressInAnnulus(from, minDistance, maxDistance);
    
    // Get the route to that destination
    return getShortestPath(from, destination);
} 