import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { signIn } from '../../auth';

// Handle loading the login page
export const load = (async ({ locals, url }) => {
    const session = await locals.auth();
    
    // If user is already logged in and not trying to view an error message, redirect to home
    if (session?.user && !url.searchParams.has('error')) {
        throw redirect(302, '/');
    }
    
    return {
        session,
        error: url.searchParams.get('error')
    };
}) satisfies PageServerLoad;

// Handle form submissions
export const actions = { 
    default: async (event) => {
        try {
            // Use the Auth.js signIn function
            return await signIn(event);
        } catch (error) {
            console.error('Error in login action:', error);
            return fail(500, { error: 'Internal server error during login' });
        }
    }
} satisfies Actions; 