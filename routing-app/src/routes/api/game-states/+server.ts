import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, users } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { config } from '$lib/server/config';

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

		return json(userGameStates);
	} catch (err) {
		console.error('Error fetching game states:', err);
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

		// Debug: Check if user exists in database
		console.log('Session user ID:', session.user.id);

		// Verify the user exists in the users table
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		if (existingUser.length === 0) {
			console.error('User not found in database:', session.user.id);
			return error(400, 'User not found. Please log out and log back in.');
		}

		console.log('User found:', existingUser[0]);

		const newGameState = {
			id: nanoid(),
			name: name.trim(),
			userId: session.user.id,
			createdAt: new Date(Date.now()),
			money: config.game.startingMoney.toString(),
			routeLevel: 3
		};

		const [created] = await db.insert(gameStates).values(newGameState).returning();

		return json(created, { status: 201 });
	} catch (err) {
		console.error('Error creating game state:', err);
		return error(500, 'Failed to create game state');
	}
};

// DELETE /api/game-states - Delete a game state
export const DELETE: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { gameStateId } = await request.json();

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

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting game state:', err);
		return error(500, 'Failed to delete game state');
	}
};
