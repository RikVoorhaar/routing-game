import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { purchaseUpgrade } from '$lib/server/upgrades/upgradePurchase';
import { log } from '$lib/logger';
import { updateRequestContext } from '$lib/server/logging/requestContext';

// POST /api/upgrades/purchase - Purchase a global upgrade
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	let gameStateId: string | undefined;
	let upgradeId: string | undefined;
	try {
		const body = await request.json();
		gameStateId = body?.gameStateId;
		upgradeId = body?.upgradeId;

		if (!gameStateId || !upgradeId) {
			return error(400, 'Game state ID and upgrade ID are required');
		}

		if (typeof gameStateId !== 'string' || typeof upgradeId !== 'string') {
			return error(400, 'Game state ID and upgrade ID must be strings');
		}

		updateRequestContext({ gameStateId });

		const updatedGameState = await purchaseUpgrade(gameStateId, upgradeId, session.user.id);

		return json(updatedGameState);
	} catch (err) {
		log.api.error(
			{
				event: 'upgrade.purchase.error',
				game_state_id: gameStateId,
				upgrade_id: upgradeId,
				user_id: session.user.id,
				err:
					err instanceof Error
						? {
								name: err.name,
								message: err.message,
								stack: err.stack
							}
						: err
			},
			'Error purchasing upgrade'
		);

		// Return appropriate error based on error message
		if (err instanceof Error) {
			if (err.message.includes('not found')) {
				return error(404, err.message);
			}
			if (err.message.includes('already purchased')) {
				return error(409, err.message); // Conflict
			}
			if (
				err.message.includes('requirements not met') ||
				err.message.includes('Insufficient funds')
			) {
				return error(400, err.message);
			}
			if (err.message.includes('access denied')) {
				return error(403, err.message);
			}
		}

		return error(500, 'Failed to purchase upgrade');
	}
};
