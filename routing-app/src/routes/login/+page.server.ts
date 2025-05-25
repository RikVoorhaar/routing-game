import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { signIn } from '../../auth';

// Just check if the user is already logged in
export const load = (async ({ locals }) => {
    const session = await locals.auth();
    
    if (session?.user) {
        throw redirect(302, '/');
    }
    
    return {
        session
    };
}) satisfies PageServerLoad;

export const actions = { default: signIn } satisfies Actions; 