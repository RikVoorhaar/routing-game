import { db } from '../server/db';
import { employees, activeJobs, gameStates, addresses } from '../server/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { log } from '$lib/logger';
import type { Employee, ActiveJob, GameState } from '../server/db/schema';
import { JobCategory } from '../jobs/jobCategories';
import {
	computeXpGain,
	buildCategoryXpIncrementExpr,
	buildMultiCategoryXpIncrementExpr
} from '../server/xp/xpUpdates';

export interface JobCompletionResult {
	employee: Employee;
	gameState: GameState;
	reward: number;
	newBalance: number;
	completedActiveJob: ActiveJob;
	employeeXpGained: number;
	categoryXpGained: number;
	jobCategory: JobCategory;
}

/**
 * Complete an active job and update employee/game state
 * This logic is shared between the job completion endpoint and bulk state loading
 */
export async function completeActiveJob(
	activeJobId: string,
	updateGameState: boolean = true
): Promise<JobCompletionResult> {
	// Starting completion logged at debug level (DB queries will show the work)
	// Get the active job with employee and game state
	const [activeJobData] = await db
		.select({
			activeJob: activeJobs,
			employee: employees,
			gameState: gameStates
		})
		.from(activeJobs)
		.innerJoin(employees, eq(activeJobs.employeeId, employees.id))
		.innerJoin(gameStates, eq(activeJobs.gameStateId, gameStates.id))
		.where(eq(activeJobs.id, activeJobId))
		.limit(1);

	if (!activeJobData) {
		throw new Error('Active job not found');
	}

	const { activeJob, employee, gameState } = activeJobData;

	// Calculate reward based on job data
	const reward = activeJob.reward;

	// Get XP multiplier from upgrade effects
	const xpMultiplier = gameState.upgradeEffects?.xpMultiplier ?? 1;

	// Calculate XP gains with multiplier applied
	const employeeXpGained = computeXpGain(activeJob.xp, xpMultiplier);
	const categoryXpGained = computeXpGain(activeJob.xp, xpMultiplier);
	const jobCategory = activeJob.jobCategory as JobCategory;

	// Get the job end location for updating employee position
	const endAddress = await db.query.addresses.findFirst({
		where: eq(addresses.id, activeJob.jobDeliverAddress)
	});

	if (!endAddress) {
		throw new Error('End address not found');
	}

	const result = await db.transaction(async (tx) => {
		// Delete the completed active job
		await tx.delete(activeJobs).where(eq(activeJobs.id, activeJobId));

		// Update employee - atomically increment XP and update location (store Coordinate, not Address)
		const [updatedEmployee] = await tx
			.update(employees)
			.set({
				xp: sql`${employees.xp} + ${employeeXpGained}`,
				location: { lat: endAddress.lat, lon: endAddress.lon }
			})
			.where(eq(employees.id, employee.id))
			.returning();

		if (!updatedEmployee) {
			throw new Error('Failed to update employee');
		}

		// Update game state: money and category XP (atomically)
		let updatedGameState: GameState = gameState;
		if (updateGameState) {
			const categoryKey = String(jobCategory);
			const [updated] = await tx
				.update(gameStates)
				.set({
					money: sql`${gameStates.money} + ${reward}`,
					xp: buildCategoryXpIncrementExpr(gameStates.xp, categoryKey, categoryXpGained)
				})
				.where(eq(gameStates.id, gameState.id))
				.returning();

			if (!updated) {
				throw new Error('Failed to update game state');
			}
			updatedGameState = updated;
		}

		return {
			employee: updatedEmployee,
			gameState: updatedGameState,
			reward,
			newBalance: updateGameState ? updatedGameState.money : gameState.money,
			completedActiveJob: activeJob,
			employeeXpGained,
			categoryXpGained,
			jobCategory
		};
	});

	// Log structured business event at info level
	log.game.info(
		{
			event: 'job.complete',
			active_job_id: activeJobId,
			employee_id: result.employee.id,
			game_state_id: result.gameState.id,
			job_category: result.jobCategory,
			reward: result.reward,
			employee_xp_gained: result.employeeXpGained,
			category_xp_gained: result.categoryXpGained,
			new_balance: result.newBalance,
			game_state_updated: updateGameState
		},
		`Job completed: ${result.jobCategory} - Reward: ${result.reward}, XP: ${result.employeeXpGained}`
	);

	return result;
}

/**
 * Check for completed jobs and process them automatically
 * Used during state loading to catch any jobs that completed while offline
 */
export async function processCompletedJobs(gameStateId: string): Promise<{
	processedJobs: number;
	totalReward: number;
	updatedEmployees: Employee[];
	updatedGameState: GameState;
}> {
	log.game.debug(
		{
			event: 'job.batch.process.start',
			game_state_id: gameStateId
		},
		`Processing completed jobs for game state: ${gameStateId}`
	);

	// Get all active jobs for this game state that have been started
	const activeJobsData = await db
		.select()
		.from(activeJobs)
		.where(
			and(
				eq(activeJobs.gameStateId, gameStateId),
				isNotNull(activeJobs.startTime) // Only jobs that have been started
			)
		);

	const currentTime = Date.now();
	const jobsToComplete: ActiveJob[] = [];

	// Check which jobs should be completed based on timing
	for (const activeJob of activeJobsData) {
		if (isJobComplete(activeJob, currentTime)) {
			jobsToComplete.push(activeJob);
		}
	}

	log.game.debug(
		{
			event: 'job.batch.process.found',
			game_state_id: gameStateId,
			jobs_to_complete: jobsToComplete.length
		},
		`Found ${jobsToComplete.length} jobs to complete`
	);

	// Process all jobs in parallel (without updating game state)
	const jobCompletionPromises = jobsToComplete.map((activeJob) =>
		completeActiveJob(activeJob.id, false).catch((error) => {
			log.game.error(
				{
					event: 'job.batch.complete.error',
					game_state_id: gameStateId,
					active_job_id: activeJob.id,
					err:
						error instanceof Error
							? {
									name: error.name,
									message: error.message,
									stack: error.stack
								}
							: error
				},
				`Failed to complete job: ${activeJob.id}`
			);
			return null;
		})
	);

	const results = await Promise.all(jobCompletionPromises);
	const successfulResults = results.filter((result) => result !== null) as JobCompletionResult[];

	const totalReward = successfulResults.reduce((sum, result) => sum + result.reward, 0);
	const updatedEmployees = successfulResults.map((result) => result.employee);

	// Calculate total category XP updates (already multiplied in completeActiveJob)
	const categoryXpUpdates: Record<string, number> = {};
	successfulResults.forEach((result) => {
		const categoryKey = String(result.jobCategory);
		categoryXpUpdates[categoryKey] =
			(categoryXpUpdates[categoryKey] || 0) + result.categoryXpGained;
	});

	// Single atomic update to game state with total reward and multi-category XP
	const [updatedGameState] = await db
		.update(gameStates)
		.set({
			money: sql`${gameStates.money} + ${totalReward}`,
			xp: buildMultiCategoryXpIncrementExpr(gameStates.xp, categoryXpUpdates)
		})
		.where(eq(gameStates.id, gameStateId))
		.returning();

	if (!updatedGameState) {
		throw new Error('Failed to update game state');
	}

	return {
		processedJobs: successfulResults.length,
		totalReward,
		updatedEmployees,
		updatedGameState
	};
}

/**
 * Check if a job should be completed based on elapsed time
 */
function isJobComplete(activeJob: ActiveJob, currentTime: number): boolean {
	if (!activeJob.startTime) {
		return false;
	}

	const startTime = new Date(activeJob.startTime).getTime();
	const totalDurationMs = activeJob.durationSeconds * 1000;
	const elapsed = currentTime - startTime;

	return elapsed >= totalDurationMs;
}
