import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, users } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { config } from '$lib/server/config';
import { log } from '$lib/logger';
import { updateRequestContext } from '$lib/server/logging/requestContext';

// GET /api/game-states - Get all game states for the current user
export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const userGameStates = await db
			.select()
			.from(gameStates)
			.where(eq(gameStates.userId, session.user.id));

		log.api.debug({
			event: 'game_state.list',
			user_id: session.user.id,
			count: userGameStates.length
		}, `Fetched ${userGameStates.length} game states`);

		return json(userGameStates);
	} catch (err) {
		log.api.error({
			event: 'game_state.list.error',
			user_id: session.user.id,
			err: err instanceof Error ? {
				name: err.name,
				message: err.message,
				stack: err.stack
			} : err
		}, 'Error fetching game states');
		return error(500, 'Failed to fetch game states');
	}
};

// POST /api/game-states - Create a new game state
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { name } = await request.json();

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return error(400, 'Character name is required');
		}

		// Verify the user exists in the users table
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		if (existingUser.length === 0) {
			log.api.error({
				event: 'game_state.create.error',
				reason: 'user_not_found',
				user_id: session.user.id
			}, 'User not found in database');
			return error(400, 'User not found. Please log out and log back in.');
		}

		const gameStateId = nanoid();
		updateRequestContext({ gameStateId });

		const newGameState = {
			id: gameStateId,
			name: name.trim(),
			userId: session.user.id,
			createdAt: new Date(Date.now()),
			money: parseFloat(config.game.startingMoney.toString()),
			upgradeEffects: { vehicleLevelMax: 0 } // Bike (level 0) is pre-unlocked
		};

		const [created] = await db.insert(gameStates).values(newGameState).returning();

		log.api.info({
			event: 'game_state.created',
			game_state_id: gameStateId,
			user_id: session.user.id,
			name: name.trim()
		}, 'Game state created');

		return json(created, { status: 201 });
	} catch (err) {
		log.api.error({
			event: 'game_state.create.error',
			user_id: session.user.id,
			err: err instanceof Error ? {
				name: err.name,
				message: err.message,
				stack: err.stack
			} : err
		}, 'Error creating game state');
		return error(500, 'Failed to create game state');
	}
};

// DELETE /api/game-states - Delete a game state
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	let gameStateId: string | undefined;
	try {
		const body = await request.json();
		gameStateId = body.gameStateId;

		if (!gameStateId || typeof gameStateId !== 'string') {
			return error(400, 'Game state ID is required');
		}

		// Verify the game state belongs to the current user before deleting
		const gameState = await db
			.select()
			.from(gameStates)
			.where(and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id)))
			.limit(1);

		if (gameState.length === 0) {
			return error(404, 'Game state not found or access denied');
		}

		await db.delete(gameStates).where(eq(gameStates.id, gameStateId));

		log.api.info({
			event: 'game_state.deleted',
			game_state_id: gameStateId,
			user_id: session.user.id
		}, 'Game state deleted');

		return json({ success: true });
	} catch (err) {
		log.api.error({
			event: 'game_state.delete.error',
			game_state_id: gameStateId,
			user_id: session.user.id,
			err: err instanceof Error ? {
				name: err.name,
				message: err.message,
				stack: err.stack
			} : err
		}, 'Error deleting game state');
		return error(500, 'Failed to delete game state');
	}
};
