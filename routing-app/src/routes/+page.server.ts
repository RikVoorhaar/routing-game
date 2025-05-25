import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
    return {
        session: locals.auth
    };
}) satisfies PageServerLoad; 