import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: ServerLoad = async ({ locals }) => {
    const session = await locals.auth();
    
    if (!session?.user) {
        throw redirect(303, '/login');
    }
    
    // Debug: Log session info
    console.log('Session user:', JSON.stringify(session.user, null, 2));
    
    // Debug: Check if user exists in database
    if (session.user.id) {
        const userInDb = await db
            .select()
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1);
        console.log('User in database:', userInDb.length > 0 ? userInDb[0] : 'NOT FOUND');
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
}; 