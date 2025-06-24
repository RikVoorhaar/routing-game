import { db } from '../server/db';
import { employees, activeJobs, gameStates, addresses } from '../server/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import { log } from '$lib/logger';
import type {
	Employee,
	ActiveJob,
	GameState,
	LevelXP,
	CategoryLevels,
	Address
} from '../server/db/schema';
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

		// Update game state money only if requested
		if (updateGameState) {
			await tx.update(gameStates).set({ money: newBalance }).where(eq(gameStates.id, gameState.id));
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
		.select({
			activeJob: activeJobs,
			employee: employees
		})
		.from(activeJobs)
		.innerJoin(employees, eq(activeJobs.employeeId, employees.id))
		.where(
			and(
				eq(employees.gameId, gameStateId),
				isNotNull(activeJobs.startTime) // Only jobs that have been started
			)
		);

	const currentTime = Date.now();
	const jobsToComplete: Array<{ activeJob: ActiveJob; employee: Employee }> = [];

	// Check which jobs should be completed based on timing
	for (const { activeJob, employee } of activeJobsData) {
		if (isJobComplete(activeJob, currentTime)) {
			jobsToComplete.push({ activeJob, employee });
		}
	}

	log.debug('[JobCompletion] Found', jobsToComplete.length, 'jobs to complete');

	// Process all jobs in parallel (without updating game state)
	const jobCompletionPromises = jobsToComplete.map(({ activeJob }) =>
		completeActiveJob(activeJob.id, false).catch((error) => {
			log.error('[JobCompletion] Failed to complete job:', activeJob.id, error);
			return null;
		})
	);

	const results = await Promise.all(jobCompletionPromises);
	const successfulResults = results.filter((result) => result !== null);

	const totalReward = successfulResults.reduce((sum, result) => sum + result.reward, 0);
	const updatedEmployees = successfulResults.map((result) => result.employee);

	// Single atomic update to game state with total reward
	const [updatedGameState] = await db
		.update(gameStates)
		.set({
			money: sql`${gameStates.money} + ${totalReward}`
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
 * Update employee after job completion - XP, location, clear active job
 */
function updateEmployeeAfterJobCompletion(
	employee: Employee,
	activeJob: ActiveJob,
	endAddress: Address
): Employee {
	//TODO: Handle logic for leveleing up
	const newDrivingLevel: LevelXP = {
		level: employee.drivingLevel.level,
		xp: employee.drivingLevel.xp + activeJob.drivingXp
	};
	const jobCategory = activeJob.jobCategory as JobCategory;
	const newCategoryLevelRecord: LevelXP = {
		level: employee.categoryLevel[jobCategory].level,
		xp: employee.categoryLevel[jobCategory].xp + activeJob.categoryXp
	};
	const newCategoryLevel: CategoryLevels = {
		...employee.categoryLevel,
		[activeJob.jobCategory as JobCategory]: newCategoryLevelRecord
	};

	const newEmployee: Employee = {
		...employee,
		drivingLevel: newDrivingLevel,
		categoryLevel: newCategoryLevel,
		location: endAddress
	};

	return newEmployee;
}
