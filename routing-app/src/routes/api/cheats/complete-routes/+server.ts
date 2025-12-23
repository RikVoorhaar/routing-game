import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, gameStates, activeJobs } from '$lib/server/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { completeActiveJob } from '$lib/jobs/jobCompletion';

// POST /api/cheats/complete-routes - Instantly complete all active routes (cheats only)
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { gameStateId } = await request.json();

		if (!gameStateId) {
			return error(400, 'Game state ID is required');
		}

		// Check if user has cheats enabled
		const [user] = await db
			.select({ cheatsEnabled: users.cheatsEnabled })
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		if (!user?.cheatsEnabled) {
			return error(403, 'Cheats are not enabled for this user');
		}

		// Verify the game state belongs to the current user
		const [gameState] = await db
			.select()
			.from(gameStates)
			.where(and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id)))
			.limit(1);

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get all active jobs for this game state that have been started
		const activeJobsData = await db
			.select({
				activeJob: activeJobs
			})
			.from(activeJobs)
			.where(
				and(
					eq(activeJobs.gameStateId, gameStateId),
					isNotNull(activeJobs.startTime) // Only jobs that have been started
				)
			);

		console.log(
			`[CHEAT] Found ${activeJobsData.length} active jobs to complete for game ${gameStateId}`
		);

		if (activeJobsData.length === 0) {
			console.log(`[CHEAT] No active jobs to complete for game ${gameStateId}`);
			return json({
				success: true,
				message: 'No active jobs to complete',
				completedRoutes: 0,
				totalReward: 0,
				newBalance: typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money
			});
		}

		// Process all active jobs using the same completion logic as normal job completion
		// We'll complete them without updating game state individually, then update once at the end
		const jobCompletionPromises = activeJobsData.map(({ activeJob }) =>
			completeActiveJob(activeJob.id, false).catch((error) => {
				console.error(`[CHEAT] Failed to complete job ${activeJob.id}:`, error);
				return null;
			})
		);

		const results = await Promise.all(jobCompletionPromises);
		const successfulResults = results.filter((result) => result !== null);

		if (successfulResults.length === 0) {
			return error(500, 'Failed to complete any jobs');
		}

		const totalReward = successfulResults.reduce((sum, result) => sum + result.reward, 0);
		const currentMoney =
			typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money;
		const newMoney = currentMoney + totalReward;

		// Update game state with total rewards in a single transaction
		await db
			.update(gameStates)
			.set({ money: newMoney })
			.where(eq(gameStates.id, gameStateId));

		console.log(
			`[CHEAT] Force completed ${successfulResults.length} active jobs for game ${gameStateId}, total reward: €${totalReward}`
		);

		return json({
			success: true,
			message: `Instantly completed ${successfulResults.length} active jobs`,
			completedRoutes: successfulResults.length,
			totalReward: totalReward,
			newBalance: newMoney
		});
	} catch (err) {
		console.error('Error completing routes via cheat:', err);
		return error(500, 'Failed to complete routes');
	}
};
