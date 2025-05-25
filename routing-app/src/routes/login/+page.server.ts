import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { signIn } from '../../auth';

// Handle loading the login page
export const load = (async ({ locals, url }) => {
    const session = await locals.auth();
    
    // Debug session information
    console.log('Load function session:', session);
    
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
        console.log('Login form submission event:', {
            url: event.url.toString(),
            method: event.request.method
        });
        
        try {
            const formData = await event.request.formData();
            console.log('Form data received:', {
                username: formData.get('username'),
                passwordLength: formData.get('password') ? String(formData.get('password')).length : 0
            });
            
            // Use the Auth.js signIn function
            return await signIn('credentials', {
                username: formData.get('username'),
                password: formData.get('password'),
                redirect: false
            });
        } catch (error) {
            console.error('Error in login action:', error);
            return fail(500, { error: 'Internal server error during login' });
        }
    }
} satisfies Actions; 