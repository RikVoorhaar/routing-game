import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { routes } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';

// GET /api/routes?ids=id1,id2,id3 - Get multiple routes by IDs
export const GET: RequestHandler = async ({ url, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    const idsParam = url.searchParams.get('ids');
    
    if (!idsParam) {
        return error(400, 'Route IDs parameter is required');
    }

    try {
        const routeIds = idsParam.split(',').filter(id => id.trim().length > 0);
        
        if (routeIds.length === 0) {
            return json([]);
        }

        const foundRoutes = await db
            .select()
            .from(routes)
            .where(inArray(routes.id, routeIds));

        return json(foundRoutes);
    } catch (err) {
        console.error('Error fetching routes:', err);
        return error(500, 'Failed to fetch routes');
    }
}; 