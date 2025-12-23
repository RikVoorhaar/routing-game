import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { routes, addresses } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

// GET /api/routes/[routeId] - Get a specific route with address data
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
		// Get route with its start and end addresses
		const startAddressAlias = alias(addresses, 'start_address');
		const endAddressAlias = alias(addresses, 'end_address');

		const [routeWithAddresses] = await db
			.select({
				route: routes,
				startAddress: startAddressAlias,
				endAddress: endAddressAlias
			})
			.from(routes)
			.innerJoin(startAddressAlias, eq(routes.startAddressId, startAddressAlias.id))
			.innerJoin(endAddressAlias, eq(routes.endAddressId, endAddressAlias.id))
			.where(eq(routes.id, routeId))
			.limit(1);

		if (!routeWithAddresses) {
			return error(404, 'Route not found');
		}

		// Transform to match the expected format for backward compatibility
		const transformedRoute = {
			id: routeWithAddresses.route.id,
			startLocation: {
				id: routeWithAddresses.startAddress.id,
				lat: parseFloat(routeWithAddresses.startAddress.lat),
				lon: parseFloat(routeWithAddresses.startAddress.lon),
				street: routeWithAddresses.startAddress.street,
				house_number: routeWithAddresses.startAddress.houseNumber,
				city: routeWithAddresses.startAddress.city,
				postcode: routeWithAddresses.startAddress.postcode
			},
			endLocation: {
				id: routeWithAddresses.endAddress.id,
				lat: parseFloat(routeWithAddresses.endAddress.lat),
				lon: parseFloat(routeWithAddresses.endAddress.lon),
				street: routeWithAddresses.endAddress.street,
				house_number: routeWithAddresses.endAddress.houseNumber,
				city: routeWithAddresses.endAddress.city,
				postcode: routeWithAddresses.endAddress.postcode
			},
			lengthTime: parseFloat(routeWithAddresses.route.lengthTime),
			goodsType: routeWithAddresses.route.goodsType,
			weight: parseFloat(routeWithAddresses.route.weight),
			reward: parseFloat(routeWithAddresses.route.reward),
			routeData: routeWithAddresses.route.routeData,
			// These fields are now handled by activeJobs table
			startTime: null,
			endTime: null
		};

		return json(transformedRoute);
	} catch (err) {
		console.error('Error fetching route:', err);
		return error(500, 'Failed to fetch route');
	}
};
