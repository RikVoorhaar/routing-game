import { db } from '../server/db';
import { employees, activeJobs, gameStates, addresses } from '../server/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { log } from '$lib/logger';
import type { Employee, ActiveJob, GameState, Address } from '../server/db/schema';
import { JobCategory } from '../jobs/jobCategories';

export interface JobCompletionResult {
	employee: Employee;
	gameState: GameState;
	reward: number;
	newBalance: number;
	completedActiveJob: ActiveJob;
}

/**
 * Complete an active job and update employee/game state
 * This logic is shared between the job completion endpoint and bulk state loading
 */
export async function completeActiveJob(
	activeJobId: string,
	updateGameState: boolean = true
): Promise<JobCompletionResult> {
	log.debug('[JobCompletion] Starting completion for job:', activeJobId);
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
	const newBalance = gameState.money + reward;

	// Get the job end location for updating employee position
	const endAddress = await db.query.addresses.findFirst({
		where: eq(addresses.id, activeJob.employeeEndAddressId)
	});

	if (!endAddress) {
		throw new Error('End address not found');
	}

	const result = await db.transaction(async (tx) => {
		// Delete the completed active job
		await tx.delete(activeJobs).where(eq(activeJobs.id, activeJobId));

		// Update employee - clear active job and update location/XP
		const updatedEmployee = updateEmployeeAfterJobCompletion(employee, activeJob, endAddress);
		await tx.update(employees).set(updatedEmployee).where(eq(employees.id, employee.id));

		// Update game state: money and category XP
		if (updateGameState) {
			// Update category XP in gameState
			const jobCategory = activeJob.jobCategory as JobCategory;
			const currentCategoryXp = (gameState.xp?.[jobCategory] as number) || 0;
			const newCategoryXp = currentCategoryXp + activeJob.categoryXp;
			const updatedXp = {
				...(gameState.xp || {}),
				[jobCategory]: newCategoryXp
			};

			await tx
				.update(gameStates)
				.set({
					money: newBalance,
					xp: updatedXp
				})
				.where(eq(gameStates.id, gameState.id));
		}

		return {
			employee: updatedEmployee,
			gameState: { ...gameState, money: updateGameState ? newBalance : gameState.money },
			reward,
			newBalance: updateGameState ? newBalance : gameState.money,
			completedActiveJob: activeJob // Return the original active job before deletion
		};
	});

	log.debug(
		'[JobCompletion] Job completed successfully. Reward:',
		reward,
		'New balance:',
		updateGameState ? newBalance : 'not updated'
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
	log.debug('[JobCompletion] Processing completed jobs for game state:', gameStateId);

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

	log.debug('[JobCompletion] Found', jobsToComplete.length, 'jobs to complete');

	// Process all jobs in parallel (without updating game state)
	const jobCompletionPromises = jobsToComplete.map((activeJob) =>
		completeActiveJob(activeJob.id, false).catch((error) => {
			log.error('[JobCompletion] Failed to complete job:', activeJob.id, error);
			return null;
		})
	);

	const results = await Promise.all(jobCompletionPromises);
	const successfulResults = results.filter((result) => result !== null);

	const totalReward = successfulResults.reduce((sum, result) => sum + result.reward, 0);
	const updatedEmployees = successfulResults.map((result) => result.employee);

	// Calculate total category XP updates
	const categoryXpUpdates: Record<JobCategory, number> = {} as Record<JobCategory, number>;
	successfulResults.forEach((result) => {
		const category = result.completedActiveJob.jobCategory as JobCategory;
		categoryXpUpdates[category] = (categoryXpUpdates[category] || 0) + result.completedActiveJob.categoryXp;
	});

	// Get current game state to update XP
	const [currentGameState] = await db
		.select()
		.from(gameStates)
		.where(eq(gameStates.id, gameStateId))
		.limit(1);

	if (!currentGameState) {
		throw new Error('Game state not found');
	}

	// Update category XP
	const currentXp = (currentGameState.xp || {}) as Record<JobCategory, number>;
	const updatedXp = { ...currentXp };
	Object.entries(categoryXpUpdates).forEach(([category, xp]) => {
		const cat = parseInt(category) as JobCategory;
		updatedXp[cat] = (updatedXp[cat] || 0) + xp;
	});

	// Single atomic update to game state with total reward and XP
	const [updatedGameState] = await db
		.update(gameStates)
		.set({
			money: sql`${gameStates.money} + ${totalReward}`,
			xp: updatedXp
		})
		.where(eq(gameStates.id, gameStateId))
		.returning();

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
/**
 * Update employee after job completion - XP, location
 * New upgrade system: employees have single XP value, category XP goes to gameState
 */
function updateEmployeeAfterJobCompletion(
	employee: Employee,
	activeJob: ActiveJob,
	endAddress: Address
): Employee {
	// Update employee XP (single value) - add driving XP
	const newEmployee: Employee = {
		...employee,
		xp: employee.xp + activeJob.drivingXp,
		location: endAddress
	};

	return newEmployee;
}
