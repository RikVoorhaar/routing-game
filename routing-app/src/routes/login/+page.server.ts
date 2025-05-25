import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { signIn } from '../../auth';

// Just check if the user is already logged in
export const load = (async ({ locals }) => {
    if (locals.auth?.user) {
        throw redirect(302, '/');
    }
}) satisfies PageServerLoad;

export const actions = { default: signIn } satisfies Actions; 