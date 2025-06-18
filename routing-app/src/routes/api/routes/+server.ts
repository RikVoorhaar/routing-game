import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { routes, addresses } from '$lib/server/db/schema';
import { inArray, eq, alias } from 'drizzle-orm';

// GET /api/routes?ids=id1,id2,id3 - Get multiple routes by IDs with address data
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

        // Get routes with their start and end addresses
        const startAddressAlias = alias(addresses, 'start_address');
        const endAddressAlias = alias(addresses, 'end_address');
        
        const foundRoutes = await db
            .select({
                route: routes,
                startAddress: startAddressAlias,
                endAddress: endAddressAlias
            })
            .from(routes)
            .innerJoin(startAddressAlias, eq(routes.startAddressId, startAddressAlias.id))
            .innerJoin(endAddressAlias, eq(routes.endAddressId, endAddressAlias.id))
            .where(inArray(routes.id, routeIds));

        // Transform to match the expected format for backward compatibility
        const transformedRoutes = foundRoutes.map(({ route, startAddress, endAddress }) => ({
            id: route.id,
            startLocation: {
                id: startAddress.id,
                lat: parseFloat(startAddress.lat),
                lon: parseFloat(startAddress.lon),
                street: startAddress.street,
                house_number: startAddress.houseNumber,
                city: startAddress.city,
                postcode: startAddress.postcode
            },
            endLocation: {
                id: endAddress.id,
                lat: parseFloat(endAddress.lat),
                lon: parseFloat(endAddress.lon),
                street: endAddress.street,
                house_number: endAddress.houseNumber,
                city: endAddress.city,
                postcode: endAddress.postcode
            },
            lengthTime: parseFloat(route.lengthTime),
            goodsType: route.goodsType,
            weight: parseFloat(route.weight),
            reward: parseFloat(route.reward),
            routeData: route.routeData,
            // These fields are now handled by activeJobs table
            startTime: null,
            endTime: null
        }));

        return json(transformedRoutes);
    } catch (err) {
        console.error('Error fetching routes:', err);
        return error(500, 'Failed to fetch routes');
    }
}; 