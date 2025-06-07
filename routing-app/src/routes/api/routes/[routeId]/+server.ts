import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { routes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// GET /api/routes/[routeId] - Get a specific route
export const GET: RequestHandler = async ({ params, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    const { routeId } = params;

    if (!routeId) {
        return error(400, 'Route ID is required');
    }

    try {
        const [route] = await db
            .select()
            .from(routes)
            .where(eq(routes.id, routeId))
            .limit(1);

        if (!route) {
            return error(404, 'Route not found');
        }

        return json(route);
    } catch (err) {
        console.error('Error fetching route:', err);
        return error(500, 'Failed to fetch route');
    }
}; 