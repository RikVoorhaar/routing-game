import { type InferSelectModel } from 'drizzle-orm';
import { employees, gameStates, routes } from './server/db/schema';
import { getRandomRouteInAnnulus } from './routing';
import { type Address, type Coordinate } from './types';
import { db } from './server/db';
import { eq } from 'drizzle-orm';

// Constants for route generation
export const ROUTE_DISTANCES_KM = [
    0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000
];

export const MIN_WEIGHT = 1;
export const MAX_WEIGHT = 100;
export const MIN_REWARD_MULTIPLIER = 0.5;
export const MAX_REWARD_MULTIPLIER = 1.5;
export const REWARD_DISTANCE_POWER = 1.2;

// Constants for employee management
export const DEFAULT_EMPLOYEE_LOCATION: Address = {
    id: 'domplein-1',
    lat: 52.09082916316217,
    lon: 5.12112919278711,
    street: 'Domplein',
    house_number: '1',
    city: 'Utrecht',
    postcode: '3512 JC'
};

export const MIN_ROUTE_REGEN_INTERVAL = 10 * 60 * 1000; // 10 minutes in milliseconds

export enum GoodsType {
    GENERAL = 'GENERAL',
    FOOD = 'FOOD',
    ELECTRONICS = 'ELECTRONICS',
    CHEMICALS = 'CHEMICALS',
    CONSTRUCTION = 'CONSTRUCTION'
}

export type EmployeeWithGameState = InferSelectModel<typeof employees> & {
    gameState: InferSelectModel<typeof gameStates>;
};

type RouteInsert = InferSelectModel<typeof routes>;

/**
 * Generates a single route for an employee within a specified distance range
 */
export async function generateSingleRoute(
    employee: EmployeeWithGameState,
    minDistanceKm: number,
    maxDistanceKm: number
): Promise<RouteInsert> {
    // Get the employee's current location or use a default
    if (!employee.location) {
        throw new Error('Employee must have a location to generate routes');
    }
    const location = JSON.parse(employee.location as string) as Address;
    const startLocation: Coordinate = {
        lat: location.lat,
        lon: location.lon
    };

    // Generate a random route in the specified annulus
    // Use the employee's maxSpeed if available
    const maxSpeed = employee.maxSpeed ? Math.round(employee.maxSpeed) : undefined;
    const routeResult = await getRandomRouteInAnnulus(
        startLocation,
        minDistanceKm,
        maxDistanceKm,
        maxSpeed
    );

    // Use the actual distance from the routing result
    const distanceKm = routeResult.totalDistanceMeters / 1000;
    const weight = computeWeight();
    const reward = computeReward(distanceKm);

    // Randomly select a goods type
    const goodsTypes = Object.values(GoodsType);
    const goodsType = goodsTypes[Math.floor(Math.random() * goodsTypes.length)];

    return {
        id: crypto.randomUUID(),
        startLocation: JSON.stringify(location),
        endLocation: JSON.stringify(routeResult.destination),
        lengthTime: routeResult.travelTimeSeconds,
        startTime: null,
        endTime: null,
        goodsType,
        weight,
        reward,
        routeData: JSON.stringify(routeResult.path)
    };
}

function computeWeight(): number {
    const weight = Math.floor(Math.random() * (MAX_WEIGHT - MIN_WEIGHT + 1)) + MIN_WEIGHT;
    return weight;
}

function computeReward(distanceKm: number): number {
    const rewardMultiplier = Math.random() * (MAX_REWARD_MULTIPLIER - MIN_REWARD_MULTIPLIER) + MIN_REWARD_MULTIPLIER;
    const reward = rewardMultiplier * Math.pow(distanceKm, REWARD_DISTANCE_POWER);
    return reward;
}

/**
 * Generates multiple routes for an employee based on their route level
 */
export async function generateRoutesForEmployee(
    employee: EmployeeWithGameState
): Promise<RouteInsert[]> {
    const routes: RouteInsert[] = [];
    const routeLevel = employee.gameState.routeLevel;

    // Generate routes for each level up to the employee's route level
    for (let i = 0; i < routeLevel; i++) {
        const minDistance = ROUTE_DISTANCES_KM[i];
        const maxDistance = ROUTE_DISTANCES_KM[i + 1];
        
        const route = await generateSingleRoute(employee, minDistance, maxDistance);
        routes.push(route);
    }

    return routes;
}

/**
 * Updates the database with new routes for an employee
 */
export async function updateEmployeeRoutes(employee: EmployeeWithGameState): Promise<void> {
    // Generate new routes
    const newRoutes = await generateRoutesForEmployee(employee);

    // Insert new routes into the database
    await db.insert(routes).values(newRoutes);

    // Update employee's available routes and time routes were generated
    const routeIds = newRoutes.map(route => route.id);
    await db.update(employees)
        .set({
            availableRoutes: JSON.stringify(routeIds),
            timeRoutesGenerated: new Date(Date.now())
        })
        .where(eq(employees.id, employee.id));
}

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
