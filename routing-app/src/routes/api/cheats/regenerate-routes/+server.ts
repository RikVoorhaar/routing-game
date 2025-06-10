import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, gameStates, employees } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { updateEmployeeRoutes, type EmployeeWithGameState } from '$lib/generateRoutes';

// POST /api/cheats/regenerate-routes - Regenerate routes for all employees (cheats only)
export const POST: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { gameStateId } = await request.json();
        
        if (!gameStateId) {
            return error(400, 'Game state ID is required');
        }

        // Check if user has cheats enabled
        const [user] = await db
            .select({ cheatsEnabled: users.cheatsEnabled })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1);

        if (!user?.cheatsEnabled) {
            return error(403, 'Cheats are not enabled for this user');
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

        // Get all employees for this game state
        const gameEmployees = await db
            .select()
            .from(employees)
            .where(eq(employees.gameId, gameStateId));

        if (gameEmployees.length === 0) {
            return json({ 
                success: true, 
                message: 'No employees found to regenerate routes for',
                employeesUpdated: 0
            });
        }

        let employeesUpdated = 0;

        // Regenerate routes for all employees (bypassing time checks)
        for (const employee of gameEmployees) {
            try {
                // Create employee with game state for route generation
                const employeeWithGameState: EmployeeWithGameState = {
                    ...employee,
                    gameState
                };

                // Generate new routes (this will delete old ones and create new ones)
                await updateEmployeeRoutes(employeeWithGameState);
                employeesUpdated++;
                
                console.log(`[CHEAT] Regenerated routes for employee ${employee.id}`);
            } catch (err) {
                console.error(`Error regenerating routes for employee ${employee.id}:`, err);
                // Continue with other employees even if one fails
            }
        }

        console.log(`[CHEAT] Regenerated routes for ${employeesUpdated}/${gameEmployees.length} employees in game ${gameStateId}`);

        return json({ 
            success: true, 
            message: `Regenerated routes for ${employeesUpdated} employees`,
            employeesUpdated: employeesUpdated,
            totalEmployees: gameEmployees.length
        });

    } catch (err) {
        console.error('Error regenerating routes via cheat:', err);
        return error(500, 'Failed to regenerate routes');
    }
}; 