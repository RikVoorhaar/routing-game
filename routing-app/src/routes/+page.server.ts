import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
    const session = await locals.auth();
    
    return {
        session
    };
}) satisfies PageServerLoad; 