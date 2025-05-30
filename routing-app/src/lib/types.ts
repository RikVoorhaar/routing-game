export interface Address {
    id: string;
    lat: number;
    lon: number;
    street?: string;
    house_number?: string;
    city?: string;
    postcode?: string;
}

export interface Coordinate {
    lat: number;
    lon: number;
}

export interface PathPoint {
    coordinates: {
        lat: number;
        lon: number;
    };
    cumulative_time_seconds: number;
}

export interface RoutingResult {
    path: PathPoint[];
    travelTimeSeconds: number;
    destination: Address;
} 