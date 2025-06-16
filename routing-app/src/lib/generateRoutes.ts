import { type InferSelectModel } from 'drizzle-orm';
import { employees, gameStates, routes } from './server/db/schema';
import { getRandomRouteInAnnulus } from './routing';
import { type Address, type Coordinate } from './types';
import { db } from './server/db';
import { eq, inArray, and, isNotNull, lt } from 'drizzle-orm';

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

// Helper function to safely parse JSON for compatibility with both SQLite and PostgreSQL
function parseJson<T>(data: any): T {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }
  return data as T;
}

// Helper function to safely stringify JSON for database storage
function stringifyJson(data: any): any {
  // PostgreSQL JSONB expects objects, SQLite expects strings
  // The schema will handle the conversion appropriately
  return data;
}

/**
 * Generates a single route for an employee within a specified distance range
 */
export async function generateSingleRoute(
    employee: EmployeeWithGameState,
    minDistanceKm: number,
    maxDistanceKm: number
): Promise<RouteInsert> {
    if (!employee.location) {
        throw new Error('Employee must have a location to generate routes');
    }

    // Parse employee location - handle both string (SQLite) and object (PostgreSQL)
    const location = parseJson<Address>(employee.location);
    const startLocation: Coordinate = {
        lat: location.lat,
        lon: location.lon
    };

    // Generate a random route in the specified annulus
    // Use the employee's maxSpeed if available
    const maxSpeed = employee.maxSpeed ? Number(employee.maxSpeed) : undefined;
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
        startLocation: stringifyJson(location),
        endLocation: stringifyJson(routeResult.destination),
        lengthTime: routeResult.travelTimeSeconds,
        startTime: null,
        endTime: null,
        goodsType,
        weight: weight.toString(),
        reward: reward.toString(),
        routeData: stringifyJson(routeResult.path)
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
 * Deletes old routes associated with an employee
 */
async function deleteEmployeeRoutes(employeeId: string): Promise<void> {
    const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (employee.length === 0) return;
    
    const availableRouteIds = parseJson<string[]>(employee[0].availableRoutes);
    
    if (availableRouteIds.length > 0) {
        await db.delete(routes).where(inArray(routes.id, availableRouteIds));
        console.log(`Deleted ${availableRouteIds.length} old routes for employee ${employeeId}`);
    }
}

/**
 * Cleans up expired routes (completed routes older than 1 hour)
 */
export async function cleanupExpiredRoutes(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // Get Date object for PostgreSQL
    
    try {
        // Get all routes to check which ones should be deleted
        const routesBefore = await db.select().from(routes);
        
        // Filter expired routes - handle both SQLite (number) and PostgreSQL (Date) timestamps
        const routesToDelete = routesBefore.filter(route => {
            if (!route.endTime) return false;
            
            // Handle PostgreSQL Date objects
            if (route.endTime instanceof Date) {
                return route.endTime < oneHourAgo;
            }
            
            // Handle SQLite timestamps (numbers)
            if (typeof route.endTime === 'number') {
                return route.endTime < oneHourAgo.getTime();
            }
            
            return false;
        });
        
        if (routesToDelete.length === 0) {
            console.log('No expired routes to clean up');
            return;
        }
        
        const routeIdsToDelete = routesToDelete.map(r => r.id);
        console.log(`Found ${routesToDelete.length} expired routes to clean up`);
        
        // First, clean up any employee references to these routes to avoid foreign key issues
        const allEmployees = await db.select().from(employees);
        for (const employee of allEmployees) {
            let needsUpdate = false;
            let availableRouteIds = parseJson<string[]>(employee.availableRoutes);
            let currentRoute = employee.currentRoute;
            
            // Remove expired routes from available routes
            const filteredRouteIds = availableRouteIds.filter(id => !routeIdsToDelete.includes(id));
            if (filteredRouteIds.length !== availableRouteIds.length) {
                availableRouteIds = filteredRouteIds;
                needsUpdate = true;
            }
            
            // Clear current route if it's being deleted
            if (currentRoute && routeIdsToDelete.includes(currentRoute)) {
                currentRoute = null;
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                await db.update(employees)
                    .set({
                        availableRoutes: stringifyJson(availableRouteIds),
                        currentRoute: currentRoute
                    })
                    .where(eq(employees.id, employee.id));
                
                console.log(`Cleaned up route references for employee ${employee.id}`);
            }
        }
        
        // Delete the expired routes using ORM
        if (routeIdsToDelete.length > 0) {
            await db.delete(routes).where(inArray(routes.id, routeIdsToDelete));
            console.log(`Deleted ${routeIdsToDelete.length} expired routes`);
        }
        
    } catch (error) {
        console.error('Error cleaning up expired routes:', error);
    }
}

/**
 * Cleans up route references in employees that point to non-existent routes
 */
async function cleanupOrphanedRouteReferences(): Promise<void> {
    try {
        const allEmployees = await db.select().from(employees);
        
        for (const employee of allEmployees) {
            let needsUpdate = false;
            let availableRouteIds = parseJson<string[]>(employee.availableRoutes);
            
            // Check if available routes still exist
            if (availableRouteIds.length > 0) {
                const existingRoutes = await db.select({ id: routes.id })
                    .from(routes)
                    .where(inArray(routes.id, availableRouteIds));
                
                const existingRouteIds = existingRoutes.map(r => r.id);
                const filteredRouteIds = availableRouteIds.filter(id => existingRouteIds.includes(id));
                
                if (filteredRouteIds.length !== availableRouteIds.length) {
                    availableRouteIds = filteredRouteIds;
                    needsUpdate = true;
                }
            }
            
            // Check if current route still exists
            let currentRoute = employee.currentRoute;
            if (currentRoute) {
                const routeExists = await db.select({ id: routes.id })
                    .from(routes)
                    .where(eq(routes.id, currentRoute))
                    .limit(1);
                
                if (routeExists.length === 0) {
                    currentRoute = null;
                    needsUpdate = true;
                }
            }
            
            // Update employee if needed
            if (needsUpdate) {
                await db.update(employees)
                    .set({
                        availableRoutes: stringifyJson(availableRouteIds),
                        currentRoute: currentRoute
                    })
                    .where(eq(employees.id, employee.id));
                
                console.log(`Cleaned up orphaned route references for employee ${employee.id}`);
            }
        }
    } catch (error) {
        console.error('Error cleaning up orphaned route references:', error);
    }
}

/**
 * Updates the database with new routes for an employee
 */
export async function updateEmployeeRoutes(employee: EmployeeWithGameState): Promise<void> {
    // First, delete old routes associated with this employee
    await deleteEmployeeRoutes(employee.id);
    
    // Generate new routes
    const newRoutes = await generateRoutesForEmployee(employee);

    // Insert new routes into the database
    await db.insert(routes).values(newRoutes);

    // Update employee's available routes and time routes were generated
    const routeIds = newRoutes.map(route => route.id);
    await db.update(employees)
        .set({
            availableRoutes: stringifyJson(routeIds),
            timeRoutesGenerated: new Date(Date.now())
        })
        .where(eq(employees.id, employee.id));
    
    console.log(`Generated ${newRoutes.length} new routes for employee ${employee.id}`);
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
