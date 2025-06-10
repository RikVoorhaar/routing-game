import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, employees, routes } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DEFAULT_EMPLOYEE_LOCATION, computeEmployeeCosts, MIN_ROUTE_REGEN_INTERVAL } from '$lib/types';
import { updateEmployeeRoutes } from '$lib/generateRoutes';

// POST /api/employees - Hire a new employee
export const POST: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { gameStateId, employeeName } = await request.json();
        
        if (!gameStateId || !employeeName || typeof employeeName !== 'string') {
            return error(400, 'Game state ID and employee name are required');
        }

        // Verify the game state belongs to the current user
        const [gameState] = await db
            .select()
            .from(gameStates)
            .where(
                and(
                    eq(gameStates.id, gameStateId),
                    eq(gameStates.userId, session.user.id)
                )
            )
            .limit(1);

        if (!gameState) {
            return error(404, 'Game state not found or access denied');
        }

        // Get current employee count for this game state
        const existingEmployees = await db
            .select()
            .from(employees)
            .where(eq(employees.gameId, gameStateId));

        const employeeCount = existingEmployees.length;
        const hiringCost = computeEmployeeCosts(employeeCount);

        // Check if user has enough money
        if (gameState.money < hiringCost) {
            return error(400, `Insufficient funds. Need €${hiringCost}, but only have €${gameState.money}`);
        }

        // Create the new employee
        const newEmployee = {
            id: nanoid(),
            gameId: gameStateId,
            name: employeeName.trim(),
            upgradeState: JSON.stringify({ vehicleType: 'bicycle', capacity: 10 }),
            location: JSON.stringify(DEFAULT_EMPLOYEE_LOCATION),
            availableRoutes: JSON.stringify([]),
            timeRoutesGenerated: null,
            currentRoute: null,
            speedMultiplier: 1.0,
            maxSpeed: 20
        };

        // Use a transaction to ensure consistency
        await db.transaction(async (tx) => {
            // Insert the new employee
            await tx.insert(employees).values(newEmployee);

            // Deduct the hiring cost from game state money
            await tx.update(gameStates)
                .set({ money: gameState.money - hiringCost })
                .where(eq(gameStates.id, gameStateId));
        });

        return json({
            employee: newEmployee,
            newBalance: gameState.money - hiringCost
        }, { status: 201 });

    } catch (err) {
        console.error('Error hiring employee:', err);
        return error(500, 'Failed to hire employee');
    }
};

// PUT /api/employees - Generate routes for an employee or assign route
export const PUT: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { action, employeeId, gameStateId, routeId } = await request.json();
        
        if (!action || !employeeId || !gameStateId) {
            return error(400, 'Action, employee ID, and game state ID are required');
        }

        // Verify the game state belongs to the current user
        const [gameState] = await db
            .select()
            .from(gameStates)
            .where(
                and(
                    eq(gameStates.id, gameStateId),
                    eq(gameStates.userId, session.user.id)
                )
            )
            .limit(1);

        if (!gameState) {
            return error(404, 'Game state not found or access denied');
        }

        // Get the employee and verify ownership
        const [employee] = await db
            .select()
            .from(employees)
            .where(
                and(
                    eq(employees.id, employeeId),
                    eq(employees.gameId, gameStateId)
                )
            )
            .limit(1);

        if (!employee) {
            return error(404, 'Employee not found');
        }

        if (action === 'generateRoutes') {
            // Check if routes were generated recently
            if (employee.timeRoutesGenerated) {
                const timeSinceLastGeneration = Date.now() - employee.timeRoutesGenerated.getTime();
                if (timeSinceLastGeneration < MIN_ROUTE_REGEN_INTERVAL) {
                    const remainingTime = Math.ceil((MIN_ROUTE_REGEN_INTERVAL - timeSinceLastGeneration) / 1000 / 60);
                    return error(429, `Routes were generated recently. Please wait ${remainingTime} more minutes.`);
                }
            }

            // Re-fetch employee data to ensure we have the most up-to-date location
            const [currentEmployee] = await db
                .select()
                .from(employees)
                .where(
                    and(
                        eq(employees.id, employeeId),
                        eq(employees.gameId, gameStateId)
                    )
                )
                .limit(1);

            if (!currentEmployee) {
                return error(404, 'Employee not found during route generation');
            }

            // Debug: Log the employee location being used for route generation
            console.log('Generate routes debug:');
            console.log('Employee ID:', employeeId);
            console.log('Original employee location:', employee.location);
            console.log('Current employee location for route generation:', currentEmployee.location);

            // Generate routes for the employee using current data
            const employeeWithGameState = { ...currentEmployee, gameState };
            await updateEmployeeRoutes(employeeWithGameState);

            return json({ success: true, message: 'Routes generated successfully' });

        } else if (action === 'assignRoute') {
            if (!routeId) {
                return error(400, 'Route ID is required for route assignment');
            }

            // Verify the route exists and belongs to this employee
            const availableRoutes = JSON.parse(employee.availableRoutes as string) as string[];
            if (!availableRoutes.includes(routeId)) {
                return error(400, 'Route not available for this employee');
            }

            // Check if employee is already on a route
            if (employee.currentRoute) {
                return error(400, 'Employee is already on a route');
            }

            // Use a transaction to ensure consistency
            await db.transaction(async (tx) => {
                // Clear all available routes for this employee (they're all invalid now)
                await tx.update(employees)
                    .set({ 
                        currentRoute: routeId,
                        availableRoutes: JSON.stringify([]) // Clear all available routes
                    })
                    .where(eq(employees.id, employeeId));

                // Update route start time
                await tx.update(routes)
                    .set({ startTime: new Date() })
                    .where(eq(routes.id, routeId));

                // Delete all other available routes from the database since they're no longer valid
                const otherRouteIds = availableRoutes.filter(id => id !== routeId);
                if (otherRouteIds.length > 0) {
                    await tx.delete(routes).where(inArray(routes.id, otherRouteIds));
                }
            });

            return json({ success: true, message: 'Route assigned successfully' });

        } else if (action === 'completeRoute') {
            if (!routeId) {
                return error(400, 'Route ID is required for route completion');
            }

            // Verify the employee is currently on this route
            if (employee.currentRoute !== routeId) {
                return error(400, 'Employee is not currently on this route');
            }

            // Get the route to calculate reward
            const [route] = await db
                .select()
                .from(routes)
                .where(eq(routes.id, routeId))
                .limit(1);

            if (!route) {
                return error(404, 'Route not found');
            }

            // Verify the route is actually completed
            if (!route.startTime) {
                return error(400, 'Route has not been started');
            }

            const routeStartTime = new Date(route.startTime).getTime();
            const currentTime = Date.now();
            const routeDuration = route.lengthTime * 1000; // Convert to milliseconds
            
            if (currentTime - routeStartTime < routeDuration) {
                return error(400, 'Route is not yet completed');
            }

            // Use a transaction to ensure consistency
            await db.transaction(async (tx) => {
                // Debug: Log the current employee location and route end location
                console.log('Route completion debug:');
                console.log('Employee ID:', employeeId);
                console.log('Current employee location:', employee.location);
                console.log('Route end location:', route.endLocation);
                console.log('Route end location type:', typeof route.endLocation);
                
                // Update employee: clear current route, update location to end location
                await tx.update(employees)
                    .set({ 
                        currentRoute: null,
                        location: route.endLocation,
                        timeRoutesGenerated: null // Clear the timestamp so new routes can be generated immediately
                    })
                    .where(eq(employees.id, employeeId));

                // Delete the completed route from the database
                await tx.delete(routes)
                    .where(eq(routes.id, routeId));

                // Award the route reward to the game state
                await tx.update(gameStates)
                    .set({ money: gameState.money + route.reward })
                    .where(eq(gameStates.id, gameStateId));
            });

            return json({ 
                success: true, 
                message: 'Route completed successfully',
                reward: route.reward,
                newBalance: gameState.money + route.reward
            });

        } else {
            return error(400, 'Invalid action');
        }

    } catch (err) {
        console.error('Error updating employee:', err);
        return error(500, 'Failed to update employee');
    }
}; 