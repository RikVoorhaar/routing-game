import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateSingleRoute, generateRoutesForEmployee, ROUTE_DISTANCES_KM, GoodsType, updateEmployeeRoutes } from './generateRoutes';
import type { EmployeeWithGameState } from './generateRoutes';
import type { Address } from './types';
import * as turf from '@turf/turf';

// Mock the database
vi.mock('./server/db', () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    // Expose for assertions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).mockValues = mockValues;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).mockSet = mockSet;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).mockWhere = mockWhere;
    return {
        db: {
            insert: vi.fn().mockReturnValue({ values: mockValues }),
            update: vi.fn().mockReturnValue({ set: mockSet, where: mockWhere })
        }
    };
});

// Test utilities
export function createTestGameState(routeLevel: number = 3) {
    return {
        id: 'test-game-state-id',
        userId: 'test-user-id',
        createdAt: new Date(),
        money: 1000,
        routeLevel
    };
}

export function createTestEmployee(gameState: ReturnType<typeof createTestGameState>, maxSpeed?: number) {
    const employee = {
        id: 'test-employee-id',
        gameId: gameState.id,
        name: 'Test Employee',
        upgradeState: JSON.stringify({}),
        location: JSON.stringify({ lat: 52.0907618944552, lon: 5.1211182687520695 }), // Domplein 1, Utrecht
        availableRoutes: '[]',
        timeRoutesGenerated: null,
        currentRoute: null,
        speedMultiplier: 1.0,
        maxSpeed: maxSpeed || null,
        gameState
    };
    return employee as unknown as EmployeeWithGameState;
}

describe('Route Generation', () => {
    let testEmployee: EmployeeWithGameState;

    beforeEach(() => {
        const gameState = createTestGameState();
        testEmployee = createTestEmployee(gameState);
        vi.clearAllMocks();
    });

    describe('generateSingleRoute', () => {
        it('should throw error if employee has no location', async () => {
            const employeeWithoutLocation = { ...testEmployee, location: null };
            await expect(generateSingleRoute(employeeWithoutLocation, 0.1, 0.2))
                .rejects
                .toThrow('Employee must have a location to generate routes');
        });

        it('should generate a route with valid properties', async () => {
            const route = await generateSingleRoute(testEmployee, 0.1, 0.2);

            expect(route).toBeDefined();
            expect(route.id).toBeDefined();
            expect(route.startLocation).toBeDefined();
            expect(route.endLocation).toBeDefined();
            expect(route.lengthTime).toBeGreaterThan(0);
            expect(route.startTime).toBeNull();
            expect(route.endTime).toBeNull();
            expect(Object.values(GoodsType)).toContain(route.goodsType);
            expect(route.weight).toBeGreaterThanOrEqual(1);
            expect(route.weight).toBeLessThanOrEqual(100);
            expect(route.reward).toBeGreaterThan(0);
            expect(route.routeData).toBeDefined();
        });

        it('should use employee location as start location', async () => {
            const route = await generateSingleRoute(testEmployee, 0.1, 0.2);
            const startLocation = JSON.parse(route.startLocation as string) as Address;
            const employeeLocation = JSON.parse(testEmployee.location as string) as Address;

            expect(startLocation.lat).toBe(employeeLocation.lat);
            expect(startLocation.lon).toBe(employeeLocation.lon);
        });

        it('should use employee max speed when provided', async () => {
            const employeeWithMaxSpeed = createTestEmployee(createTestGameState(), 25);
            const route = await generateSingleRoute(employeeWithMaxSpeed, 0.1, 0.2);
            
            // The route should be generated successfully
            expect(route).toBeDefined();
            expect(route.lengthTime).toBeGreaterThan(0);
            
            // Parse and check the route data contains speed information
            const routeData = JSON.parse(route.routeData as string);
            expect(Array.isArray(routeData)).toBe(true);
            expect(routeData.length).toBeGreaterThan(0);
            
            // Check that route points have the expected structure
            routeData.forEach((point: { coordinates: unknown; cumulative_time_seconds: unknown; cumulative_distance_meters: unknown; max_speed_kmh: unknown }, index: number) => {
                expect(point).toHaveProperty('coordinates');
                expect(point).toHaveProperty('cumulative_time_seconds');
                expect(point).toHaveProperty('cumulative_distance_meters');
                expect(point).toHaveProperty('max_speed_kmh');
                
                // Speed should be at or below the max speed (except for starting point)
                if (index > 0) {
                    expect(point.max_speed_kmh).toBeLessThanOrEqual(25);
                }
            });
        });
    });

    describe('generateRoutesForEmployee', () => {
        it('should generate the correct number of routes based on route level', async () => {
            const routeLevel = 3;
            testEmployee.gameState.routeLevel = routeLevel;
            
            const routes = await generateRoutesForEmployee(testEmployee);
            
            expect(routes).toHaveLength(routeLevel);
        });

        it('should generate routes with increasing distances', async () => {
            const routeLevel = 3;
            testEmployee.gameState.routeLevel = routeLevel;
            
            const routes = await generateRoutesForEmployee(testEmployee);
            
            for (let i = 0; i < routes.length; i++) {
                const startLocation = JSON.parse(routes[i].startLocation as string) as Address;
                const endLocation = JSON.parse(routes[i].endLocation as string) as Address;
                
                const from = turf.point([startLocation.lon, startLocation.lat]);
                const to = turf.point([endLocation.lon, endLocation.lat]);
                const distance = turf.distance(from, to);

                // Allow for some tolerance in distance ranges since routing may not find exact distances
                expect(distance).toBeGreaterThanOrEqual(ROUTE_DISTANCES_KM[i] * 0.8);
                expect(distance).toBeLessThanOrEqual(ROUTE_DISTANCES_KM[i + 1] * 1.5);
            }
        });
    });
});

describe('Database Operations', () => {
    let testEmployee: EmployeeWithGameState;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockValues: any, mockSet: any, mockWhere: any;

    beforeEach(() => {
        const gameState = createTestGameState();
        testEmployee = createTestEmployee(gameState);
        vi.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockValues = (globalThis as any).mockValues;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockSet = (globalThis as any).mockSet;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockWhere = (globalThis as any).mockWhere;
    });

    it('should update employee routes in the database', async () => {
        await updateEmployeeRoutes(testEmployee);

        // Verify that routes were inserted
        expect(mockValues).toHaveBeenCalled();

        // Verify that employee was updated
        expect(mockSet).toHaveBeenCalled();
        expect(mockWhere).toHaveBeenCalled();
    });
}); 