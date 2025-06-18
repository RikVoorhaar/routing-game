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
    upgradeState: string | object; // JSON string (SQLite) or object (PostgreSQL)
    location: string | object | null; // JSON string (SQLite) or object (PostgreSQL) or null
    availableRoutes: string | string[]; // JSON string (SQLite) or array (PostgreSQL)
    timeRoutesGenerated: string | Date | null; // Legacy field, not used in new system
    speedMultiplier: number;
    maxSpeed: number;
}

export interface Route {
    id: string;
    startLocation: string | object; // JSON string (SQLite) or object (PostgreSQL)
    endLocation: string | object; // JSON string (SQLite) or object (PostgreSQL)
    lengthTime: number; // in seconds (can be floating point)
    startTime: string | Date | null; // For backward compatibility
    endTime: string | Date | null; // For backward compatibility
    goodsType: string;
    weight: number;
    reward: number;
    routeData: string | object; // JSON string (SQLite) or object (PostgreSQL)
}

export interface Job {
    id: number;
    location: string; // PostGIS POINT geometry
    startAddressId: string;
    endAddressId: string;
    routeId: string;
    jobTier: number;
    jobCategory: number;
    totalDistanceKm: string;
    totalTimeSeconds: string;
    timeGenerated: string | Date;
    approximateValue: string;
}

export interface ActiveJob {
    id: string;
    employeeId: string;
    jobId: number | null; // null for employee-generated routes
    routeToJobId: string | null;
    jobRouteId: string;
    startTime: string | Date;
    endTime: string | Date | null;
    modifiedRouteToJobData: object | null;
    modifiedJobRouteData: object;
    currentPhase: 'traveling_to_job' | 'on_job';
    jobPhaseStartTime: string | Date | null;
}

// Client-safe constants
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