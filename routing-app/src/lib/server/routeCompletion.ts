import { db } from './db';
import { employees, routes, gameStates } from './db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

/**
 * Check for and process any completed routes for a given game state
 * This function should be called when loading the game state to ensure
 * all completed routes are properly processed.
 */
export async function processCompletedRoutes(gameStateId: string): Promise<{
    processedRoutes: number;
    totalReward: number;
}> {
    let processedRoutes = 0;
    let totalReward = 0;

    try {
        // Get all employees with current routes for this game state
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
                    isNotNull(employees.currentRoute),
                    isNotNull(routes.startTime)
                )
            );

        const currentTime = Date.now();
        const completedRouteUpdates: Array<{
            employeeId: string;
            routeId: string;
            reward: number;
            endLocation: string; // JSON string of Address
        }> = [];

        // Check which routes are completed
        for (const { employee, route } of employeesWithRoutes) {
            if (!route.startTime || route.endTime) {
                continue; // Skip if not started or already completed
            }

            const routeStartTime = new Date(route.startTime).getTime();
            const routeDuration = route.lengthTime * 1000; // Convert to milliseconds
            
            if (currentTime - routeStartTime >= routeDuration) {
                // Route is completed
                completedRouteUpdates.push({
                    employeeId: employee.id,
                    routeId: route.id,
                    reward: route.reward,
                    endLocation: route.endLocation as string
                });
                totalReward += route.reward;
                processedRoutes++;
            }
        }

        // Process all completed routes in a transaction
        if (completedRouteUpdates.length > 0) {
            await db.transaction(async (tx) => {
                // Get current game state
                const [gameState] = await tx
                    .select()
                    .from(gameStates)
                    .where(eq(gameStates.id, gameStateId))
                    .limit(1);

                if (!gameState) {
                    throw new Error('Game state not found');
                }

                // Update each completed route
                for (const update of completedRouteUpdates) {
                    // Update employee: clear current route, update location, clear available routes
                    await tx.update(employees)
                        .set({ 
                            currentRoute: null,
                            location: update.endLocation,
                            availableRoutes: JSON.stringify([]), // Clear available routes since they're all invalid now
                            timeRoutesGenerated: null // Clear the timestamp so new routes can be generated immediately
                        })
                        .where(eq(employees.id, update.employeeId));

                    // Delete the completed route from database instead of marking as completed
                    await tx.delete(routes)
                        .where(eq(routes.id, update.routeId));
                }

                // Update game state with total rewards
                await tx.update(gameStates)
                    .set({ money: gameState.money + totalReward })
                    .where(eq(gameStates.id, gameStateId));
            });

            console.log(`Processed ${processedRoutes} completed routes for game ${gameStateId}, total reward: ${totalReward}`);
        }

        return { processedRoutes, totalReward };
    } catch (error) {
        console.error('Error processing completed routes:', error);
        throw error;
    }
} 