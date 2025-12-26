import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { purchaseUpgrade } from '$lib/server/upgrades/upgradePurchase';

// POST /api/upgrades/purchase - Purchase a global upgrade
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { gameStateId, upgradeId } = await request.json();

		if (!gameStateId || !upgradeId) {
			return error(400, 'Game state ID and upgrade ID are required');
		}

		if (typeof gameStateId !== 'string' || typeof upgradeId !== 'string') {
			return error(400, 'Game state ID and upgrade ID must be strings');
		}

		const updatedGameState = await purchaseUpgrade(gameStateId, upgradeId, session.user.id);

		return json(updatedGameState);
	} catch (err) {
		console.error('Error purchasing upgrade:', err);

		// Return appropriate error based on error message
		if (err instanceof Error) {
			if (err.message.includes('not found')) {
				return error(404, err.message);
			}
			if (err.message.includes('already purchased')) {
				return error(409, err.message); // Conflict
			}
			if (err.message.includes('requirements not met') || err.message.includes('Insufficient funds')) {
				return error(400, err.message);
			}
			if (err.message.includes('access denied')) {
				return error(403, err.message);
			}
		}

		return error(500, 'Failed to purchase upgrade');
	}
};

