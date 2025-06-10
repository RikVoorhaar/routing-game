import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, gameStates, employees, routes } from '$lib/server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';

// POST /api/cheats/complete-routes - Instantly complete all active routes (cheats only)
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

        // Debug: Let's see what employees exist for this game
        const allEmployees = await db
            .select()
            .from(employees)
            .where(eq(employees.gameId, gameStateId));
        
        console.log(`[CHEAT] Found ${allEmployees.length} employees for game ${gameStateId}:`);
        allEmployees.forEach(emp => {
            console.log(`[CHEAT]   Employee ${emp.name} (${emp.id}): currentRoute = ${emp.currentRoute}`);
        });

        // Debug: Let's see what routes exist overall
        const allRoutes = await db.select().from(routes);
        console.log(`[CHEAT] Found ${allRoutes.length} total routes in database:`);
        allRoutes.forEach(route => {
            console.log(`[CHEAT]   Route ${route.id}: startTime=${route.startTime ? new Date(route.startTime).toISOString() : 'null'}, endTime=${route.endTime ? new Date(route.endTime).toISOString() : 'null'}`);
        });

        // Debug: Let's see what active routes exist (started but not completed)
        const activeRoutes = await db
            .select()
            .from(routes)
            .where(
                and(
                    isNotNull(routes.startTime),
                    isNull(routes.endTime)
                )
            );
        
        console.log(`[CHEAT] Found ${activeRoutes.length} active routes (started but not completed):`);
        activeRoutes.forEach(route => {
            console.log(`[CHEAT]   Active route ${route.id}: startTime=${new Date(route.startTime).toISOString()}`);
        });

        // Get all employees with active routes for this game state
        // For the cheat, we'll complete ANY route an employee is assigned to, even if it should already be completed
        const employeesWithRoutes = await db
            .select({
                employee: employees,
                route: routes
            })
            .from(employees)
            .innerJoin(routes, eq(employees.currentRoute, routes.id))
            .where(
                and(
                    eq(employees.gameId, gameStateId),
                    isNotNull(employees.currentRoute)
                    // Removed the startTime and endTime checks - cheat should work on ANY assigned route
                )
            );

        console.log(`[CHEAT] Found ${employeesWithRoutes.length} employees with active routes for game ${gameStateId}`);

        if (employeesWithRoutes.length === 0) {
            console.log(`[CHEAT] No active routes to complete for game ${gameStateId}`);
            return json({ 
                success: true, 
                message: 'No active routes to complete',
                completedRoutes: 0,
                totalReward: 0
            });
        }

        let totalReward = 0;
        const currentTime = new Date(); // Use Date object instead of Date.now()
        
        console.log(`[CHEAT] Completing routes at timestamp: ${currentTime.toISOString()}`);

        // Log each route being completed
        employeesWithRoutes.forEach(({ employee, route }) => {
            console.log(`[CHEAT] Route ${route.id} for employee ${employee.name} (${employee.id})`);
            console.log(`[CHEAT]   - Reward: €${route.reward}`);
            console.log(`[CHEAT]   - Start: ${route.startTime ? new Date(route.startTime).toISOString() : 'null'}`);
            console.log(`[CHEAT]   - End location: ${route.endLocation}`);
        });

        // Process all active routes in a transaction (force complete them)
        await db.transaction(async (tx) => {
            for (const { employee, route } of employeesWithRoutes) {
                console.log(`[CHEAT] Processing route ${route.id} for employee ${employee.id}`);
                
                // Calculate reward
                totalReward += route.reward;

                // Update employee: clear current route, update location to end location
                console.log(`[CHEAT] Updating employee ${employee.id} - clearing route and updating location`);
                await tx.update(employees)
                    .set({ 
                        currentRoute: null,
                        location: route.endLocation
                    })
                    .where(eq(employees.id, employee.id));

                // Mark route as completed (force complete with current time)
                console.log(`[CHEAT] Marking route ${route.id} as completed with timestamp: ${currentTime.toISOString()}`);
                await tx.update(routes)
                    .set({ endTime: currentTime })
                    .where(eq(routes.id, route.id));
                
                console.log(`[CHEAT] Successfully processed route ${route.id}`);
            }

            // Update game state with total rewards
            console.log(`[CHEAT] Adding €${totalReward} to game state ${gameStateId}`);
            await tx.update(gameStates)
                .set({ money: gameState.money + totalReward })
                .where(eq(gameStates.id, gameStateId));
            
            console.log(`[CHEAT] Updated game state money from €${gameState.money} to €${gameState.money + totalReward}`);
        });

        console.log(`[CHEAT] Force completed ${employeesWithRoutes.length} routes for game ${gameStateId}, total reward: ${totalReward}`);

        return json({ 
            success: true, 
            message: `Instantly completed ${employeesWithRoutes.length} routes`,
            completedRoutes: employeesWithRoutes.length,
            totalReward: totalReward,
            newBalance: gameState.money + totalReward
        });

    } catch (err) {
        console.error('Error completing routes via cheat:', err);
        return error(500, 'Failed to complete routes');
    }
}; 