import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { purchaseVehicleUpgrade } from '$lib/server/vehicles/vehicleUpgradePurchase';

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {

		const { employeeId, gameStateId } = await request.json();

		if (!employeeId || !gameStateId) {
			return error(400, 'Missing required fields: employeeId, gameStateId');
		}

		const result = await purchaseVehicleUpgrade(employeeId, gameStateId, session.user.id);

		return json(result);
	} catch (err) {
		console.error('Vehicle upgrade purchase error:', err);
		const message = err instanceof Error ? err.message : 'Failed to purchase vehicle upgrade';
		return error(400, message);
	}
};

