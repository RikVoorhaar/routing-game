import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, gameStates } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

// POST /api/cheats/add-money - Add money to a game state (cheats only)
export const POST: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { gameStateId, amount } = await request.json();
        
        if (!gameStateId || typeof amount !== 'number') {
            return error(400, 'Game state ID and amount are required');
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

        // Calculate new balance (ensure it doesn't go below 0)
        const newBalance = Math.max(0, gameState.money + amount);

        // Update the game state money
        await db.update(gameStates)
            .set({ money: newBalance })
            .where(eq(gameStates.id, gameStateId));

        return json({ 
            success: true, 
            message: `${amount >= 0 ? 'Added' : 'Subtracted'} €${Math.abs(amount)}`,
            newBalance,
            previousBalance: gameState.money
        });

    } catch (err) {
        console.error('Error adding money:', err);
        return error(500, 'Failed to add money');
    }
}; 