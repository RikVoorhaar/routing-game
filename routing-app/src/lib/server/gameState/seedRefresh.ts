import { db } from '$lib/server/db';
import { gameStates } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { log } from '$lib/logger';

/**
 * Generate a random 32-bit integer seed
 */
function generateRandomSeed(): number {
	// Generate random integer in range [0, 2^31 - 1]
	return Math.floor(Math.random() * 2147483647);
}

/**
 * Refresh the seed for a game state if it's older than the specified threshold
 * @param gameStateId - The game state ID to refresh seed for
 * @param refreshHours - Number of hours before seed should be refreshed
 * @returns Updated seed info if refreshed, null if no refresh was needed
 */
export async function refreshSeedIfNeeded(
	gameStateId: string,
	refreshHours: number
): Promise<{ seed: number; seedGeneratedAt: Date } | null> {
	try {
		// Get current game state with seed info
		const [gameState] = await db
			.select({
				seed: gameStates.seed,
				seedGeneratedAt: gameStates.seedGeneratedAt
			})
			.from(gameStates)
			.where(eq(gameStates.id, gameStateId))
			.limit(1);

		if (!gameState) {
			log.server.warn({ gameStateId }, 'Game state not found for seed refresh');
			return null;
		}

		// If seed is null, generate one immediately
		if (!gameState.seed || !gameState.seedGeneratedAt) {
			const newSeed = generateRandomSeed();
			const now = new Date();

			await db
				.update(gameStates)
				.set({
					seed: newSeed,
					seedGeneratedAt: now
				})
				.where(eq(gameStates.id, gameStateId));

			log.server.debug(
				{ gameStateId, seed: newSeed },
				'Generated initial seed for game state'
			);

			return { seed: newSeed, seedGeneratedAt: now };
		}

		// Check if seed is older than threshold
		const seedAge = Date.now() - gameState.seedGeneratedAt.getTime();
		const refreshThresholdMs = refreshHours * 60 * 60 * 1000;

		if (seedAge >= refreshThresholdMs) {
			const newSeed = generateRandomSeed();
			const now = new Date();

			await db
				.update(gameStates)
				.set({
					seed: newSeed,
					seedGeneratedAt: now
				})
				.where(eq(gameStates.id, gameStateId));

			log.server.debug(
				{
					gameStateId,
					oldSeed: gameState.seed,
					newSeed,
					seedAgeHours: seedAge / (60 * 60 * 1000)
				},
				'Refreshed seed for game state'
			);

			return { seed: newSeed, seedGeneratedAt: now };
		}

		// No refresh needed
		return null;
	} catch (error) {
		log.server.error(
			{
				gameStateId,
				refreshHours,
				err: error instanceof Error ? { name: error.name, message: error.message } : error
			},
			'Error refreshing seed for game state'
		);
		throw error;
	}
}
