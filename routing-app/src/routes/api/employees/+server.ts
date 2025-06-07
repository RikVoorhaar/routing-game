import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, employees, routes } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
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

            // Generate routes for the employee
            const employeeWithGameState = { ...employee, gameState };
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

            // Update employee to start the route
            await db.update(employees)
                .set({ currentRoute: routeId })
                .where(eq(employees.id, employeeId));

            // Update route start time
            await db.update(routes)
                .set({ startTime: new Date(Date.now()) })
                .where(eq(routes.id, routeId));

            return json({ success: true, message: 'Route assigned successfully' });

        } else {
            return error(400, 'Invalid action');
        }

    } catch (err) {
        console.error('Error updating employee:', err);
        return error(500, 'Failed to update employee');
    }
}; 