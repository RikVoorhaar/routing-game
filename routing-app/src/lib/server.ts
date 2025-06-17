import http from 'http';
import https from 'https';
import type { Address, Coordinate } from './types';

const ROUTING_SERVER_URL = 'http://localhost:8050';

// Create HTTP agent with keep-alive for connection pooling
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000, // Keep connections alive for 30 seconds
    maxSockets: 50, // Allow up to 50 concurrent connections
    maxFreeSockets: 10, // Keep up to 10 idle connections in pool
});

// Enhanced fetch with keep-alive agent
async function fetchWithKeepAlive(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...options,
        // @ts-expect-error - Node.js specific agent option
        agent: httpAgent,
    });
}

export async function getClosestAddress(location: Coordinate): Promise<Address> {
    const response = await fetchWithKeepAlive(
        `${ROUTING_SERVER_URL}/api/v1/closest_address?location=${location.lat},${location.lon}`
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
    const response = await fetchWithKeepAlive(`${ROUTING_SERVER_URL}/health`);
    
    if (!response.ok) {
        throw new Error('Server health check failed');
    }
    
    return response.json();
}

export async function getAddressBbox(): Promise<{
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
}> {
    const response = await fetchWithKeepAlive(`${ROUTING_SERVER_URL}/api/v1/bbox`);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get address bbox');
    }
    
    return response.json();
}

export async function getNumAddresses(): Promise<{ count: number }> {
    const response = await fetchWithKeepAlive(`${ROUTING_SERVER_URL}/api/v1/numAddresses`);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get address count');
    }
    
    return response.json();
}

export async function getAddressSample(params: {
    number: number;
    seed: number;
    page_size: number;
    page_num: number;
}): Promise<{
    addresses: Address[];
    pagination: {
        page_num: number;
        page_size: number;
        total_requested: number;
        returned: number;
    };
}> {
    const queryParams = new URLSearchParams({
        number: params.number.toString(),
        seed: params.seed.toString(),
        page_size: params.page_size.toString(),
        page_num: params.page_num.toString(),
    });
    
    const response = await fetchWithKeepAlive(`${ROUTING_SERVER_URL}/api/v1/addressSample?${queryParams}`);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get address sample');
    }
    
    return response.json();
}

export async function getUniformRandomAddressInAnnulus(params: {
    lat: number;
    lon: number;
    min_distance: number;
    max_distance: number;
    seed: number;
}): Promise<Address> {
    const queryParams = new URLSearchParams({
        lat: params.lat.toString(),
        lon: params.lon.toString(),
        min_distance: params.min_distance.toString(),
        max_distance: params.max_distance.toString(),
        seed: params.seed.toString(),
    });
    
    const response = await fetchWithKeepAlive(`${ROUTING_SERVER_URL}/api/v1/uniformRandomAddressInAnnulus?${queryParams}`);
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get uniform random address in annulus');
    }
    
    return response.json();
} 