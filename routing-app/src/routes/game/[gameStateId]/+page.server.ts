import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { gameStates, employees, users } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { processCompletedRoutes } from '$lib/server/routeCompletion';

export const load: PageServerLoad = async ({ locals, params }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        throw redirect(303, '/login');
    }

    const { gameStateId } = params;

    try {
        // Process any completed routes first
        await processCompletedRoutes(gameStateId);

        // Get the game state and verify ownership
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
            throw error(404, 'Game state not found or access denied');
        }

        // Get all employees for this game state
        const gameEmployees = await db
            .select()
            .from(employees)
            .where(eq(employees.gameId, gameStateId));

        // Get user's cheat status
        const [user] = await db
            .select({ cheatsEnabled: users.cheatsEnabled })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1);

        return {
            session,
            gameState,
            employees: gameEmployees,
            cheatsEnabled: user?.cheatsEnabled || false
        };
    } catch (err) {
        console.error('Error loading game state:', err);
        throw error(500, 'Failed to load game state');
    }
}; 