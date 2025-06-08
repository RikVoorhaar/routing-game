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
    coordinates: Coordinate;
    cumulative_time_seconds: number;
    cumulative_distance_meters: number;
    max_speed_kmh: number;
    is_walking_segment: boolean;
}

export interface RoutingResult {
    path: PathPoint[];
    travelTimeSeconds: number;
    totalDistanceMeters: number;
    destination: Address;
}

// Database entity types for client-side use
export interface GameState {
    id: string;
    name: string;
    userId: string;
    createdAt: string | Date;
    money: number;
    routeLevel: number;
}

export interface Employee {
    id: string;
    gameId: string;
    name: string;
    upgradeState: string; // JSON string
    location: string | null; // JSON string or null
    availableRoutes: string; // JSON string
    timeRoutesGenerated: string | Date | null;
    currentRoute: string | null;
    speedMultiplier: number;
    maxSpeed: number;
}

export interface Route {
    id: string;
    startLocation: string; // JSON string
    endLocation: string; // JSON string
    lengthTime: number;
    startTime: string | Date | null;
    endTime: string | Date | null;
    goodsType: string;
    weight: number;
    reward: number;
    routeData: string; // JSON string
}

// Client-safe constants
export const MIN_ROUTE_REGEN_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

export const DEFAULT_EMPLOYEE_LOCATION: Address = {
    id: 'domplein-1',
    lat: 52.09082916316217,
    lon: 5.12112919278711,
    street: 'Domplein',
    house_number: '1',
    city: 'Utrecht',
    postcode: '3512 JC'
};

/**
 * Computes the cost of hiring a new employee based on the number of existing employees
 * Formula: €100 * i^2 where i is the number of existing employees
 * The first employee is free (cost is 0 when i = 0)
 */
export function computeEmployeeCosts(existingEmployeeCount: number): number {
    if (existingEmployeeCount === 0) {
        return 0; // First employee is free
    }
    return 100 * Math.pow(existingEmployeeCount, 2);
} 