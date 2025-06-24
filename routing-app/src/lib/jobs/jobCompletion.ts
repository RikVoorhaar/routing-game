import { db } from '../server/db';
import { employees, activeJobs, gameStates, addresses } from '../server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';
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

		// Update game state money
		await tx.update(gameStates).set({ money: newBalance }).where(eq(gameStates.id, gameState.id));

		return {
			employee: updatedEmployee,
			gameState: { ...gameState, money: newBalance },
			reward,
			newBalance,
			completedActiveJob: activeJob // Return the original active job before deletion
		};
	});

	log.debug(
		'[JobCompletion] Job completed successfully. Reward:',
		reward,
		'New balance:',
		newBalance
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

	// Get all active jobs for this game state that haven't been marked as completed
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
				isNotNull(activeJobs.startTime),
				isNull(activeJobs.endTime) // Not yet completed
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

	let totalReward = 0;
	const updatedEmployees: Employee[] = [];

	// Process each completed job
	for (const { activeJob, employee } of jobsToComplete) {
		try {
			const result = await completeActiveJob(employee.id, activeJob.id);
			totalReward += result.reward;
			updatedEmployees.push(result.employee);
		} catch (error) {
			log.error('[JobCompletion] Failed to complete job:', activeJob.id, error);
		}
	}

	// Get updated game state
	const [updatedGameState] = await db
		.select()
		.from(gameStates)
		.where(eq(gameStates.id, gameStateId))
		.limit(1);

	return {
		processedJobs: jobsToComplete.length,
		totalReward,
		updatedEmployees,
		updatedGameState
	};
}

/**
 * Check if a job should be completed based on elapsed time
 */
function isJobComplete(activeJob: ActiveJob, currentTime: number): boolean {
	if (!activeJob.startTime || activeJob.endTime) {
		return false;
	}

	const startTime = new Date(activeJob.startTime).getTime();
	let totalDuration = 0;

	if (activeJob.currentPhase === 'traveling_to_job' && activeJob.modifiedRouteToJobData) {
		// Still traveling - check if travel time is complete
		totalDuration = activeJob.modifiedRouteToJobData.travelTimeSeconds * 1000;
	} else {
		// On job or no travel needed - calculate total time
		let travelTime = 0;
		if (activeJob.modifiedRouteToJobData) {
			travelTime = activeJob.modifiedRouteToJobData.travelTimeSeconds * 1000;
		}
		const jobTime = activeJob.modifiedJobRouteData.travelTimeSeconds * 1000;
		totalDuration = travelTime + jobTime;
	}

	const elapsed = currentTime - startTime;
	return elapsed >= totalDuration;
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
