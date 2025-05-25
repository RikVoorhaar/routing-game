import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
    const session = await locals.auth();
    
    if (!session?.user) {
        throw redirect(303, '/login');
    }
    
    return {
        session
    };
}) satisfies PageServerLoad; 