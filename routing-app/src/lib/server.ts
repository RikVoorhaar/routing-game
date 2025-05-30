import type { Address, Coordinate } from './types';

const SERVER_URL = import.meta.env.VITE_ROUTING_SERVER_URL || 'http://localhost:8050';

export async function getClosestAddress(location: Coordinate): Promise<Address> {
    const response = await fetch(
        `${SERVER_URL}/api/v1/closest_address?location=${location.lat},${location.lon}`
    );
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get closest address');
    }
    
    return response.json();
}

export async function getServerHealth(): Promise<{
    status: string;
    engine_initialized: boolean;
    node_count: number;
    arc_count: number;
    address_count: number;
}> {
    const response = await fetch(`${SERVER_URL}/health`);
    
    if (!response.ok) {
        throw new Error('Server health check failed');
    }
    
    return response.json();
} 