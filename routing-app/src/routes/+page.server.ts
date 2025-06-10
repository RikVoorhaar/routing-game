import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { gameStates, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load = (async ({ locals }) => {
    const session = await locals.auth();
    
    if (!session?.user) {
        return {
            session,
            gameStates: [],
            cheatsEnabled: false
        };
    }
    
    try {
        // Get user game states
        const userGameStates = await db
            .select()
            .from(gameStates)
            .where(eq(gameStates.userId, session.user.id!));

        // Get user's cheat status
        const [user] = await db
            .select({ cheatsEnabled: users.cheatsEnabled })
            .from(users)
            .where(eq(users.id, session.user.id!))
            .limit(1);

        return {
            session,
            gameStates: userGameStates,
            cheatsEnabled: user?.cheatsEnabled || false
        };
    } catch (err) {
        console.error('Error loading game states:', err);
        return {
            session,
            gameStates: [],
            cheatsEnabled: false
        };
    }
}) satisfies PageServerLoad; 