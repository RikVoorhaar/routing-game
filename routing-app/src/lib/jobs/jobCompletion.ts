import { db } from '../server/db';
import { employees, activeJobs, gameStates, addresses } from '../server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';
import { log } from '$lib/logger';
import type { Employee, ActiveJob, GameState } from '../server/db/schema';

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
	employeeId: string,
	activeJobId: string
): Promise<JobCompletionResult> {
	log.debug('[JobCompletion] Starting completion for employee:', employeeId, 'job:', activeJobId);

	// Get the active job with employee and game state
	const [activeJobData] = await db
		.select({
			activeJob: activeJobs,
			employee: employees,
			gameState: gameStates
		})
		.from(activeJobs)
		.innerJoin(employees, eq(activeJobs.employeeId, employees.id))
		.innerJoin(gameStates, eq(employees.gameId, gameStates.id))
		.where(and(eq(activeJobs.id, activeJobId), eq(employees.id, employeeId)))
		.limit(1);

	if (!activeJobData) {
		throw new Error('Active job not found or employee mismatch');
	}

	const { activeJob, employee, gameState } = activeJobData;

	// Calculate reward based on job data
	const reward = calculateJobReward(activeJob, employee);
	const newBalance = gameState.money + reward;

	// Get the job end location for updating employee position
	const [endAddress] = await db
		.select()
		.from(addresses)
		.where(eq(addresses.id, activeJob.modifiedJobRouteData.destination.id))
		.limit(1);

	await db.transaction(async (tx) => {
		// Mark active job as completed
		await tx
			.update(activeJobs)
			.set({
				endTime: new Date(),
				currentPhase: 'completed'
			})
			.where(eq(activeJobs.id, activeJobId));

		// Update employee - clear active job and update location/XP
		const updatedEmployee = await updateEmployeeAfterJobCompletion(
			tx,
			employee,
			activeJob,
			endAddress
		);

		// Update game state money
		await tx.update(gameStates).set({ money: newBalance }).where(eq(gameStates.id, gameState.id));

		// Get the completed active job
		const [completedJob] = await tx
			.select()
			.from(activeJobs)
			.where(eq(activeJobs.id, activeJobId))
			.limit(1);

		return {
			employee: updatedEmployee,
			gameState: { ...gameState, money: newBalance },
			reward,
			newBalance,
			completedActiveJob: completedJob
		};
	});

	log.debug(
		'[JobCompletion] Job completed successfully. Reward:',
		reward,
		'New balance:',
		newBalance
	);

	// Return the result (TypeScript will infer this is returned from the transaction)
	const [updatedEmployee] = await db
		.select()
		.from(employees)
		.where(eq(employees.id, employeeId))
		.limit(1);

	const [updatedGameState] = await db
		.select()
		.from(gameStates)
		.where(eq(gameStates.id, gameState.id))
		.limit(1);

	const [completedActiveJob] = await db
		.select()
		.from(activeJobs)
		.where(eq(activeJobs.id, activeJobId))
		.limit(1);

	return {
		employee: updatedEmployee,
		gameState: updatedGameState,
		reward,
		newBalance,
		completedActiveJob
	};
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
 * Calculate reward for completing a job
 */
function calculateJobReward(_activeJob: ActiveJob, _employee: Employee): number {
	// Base reward calculation - this could be enhanced with employee bonuses, etc.
	const baseReward = 1000; // TODO: Calculate based on job tier, distance, category, etc.

	// Apply any employee bonuses based on their upgrade levels
	// TODO: Implement upgrade bonuses

	return baseReward;
}

/**
 * Update employee after job completion - XP, location, clear active job
 */
async function updateEmployeeAfterJobCompletion(
	tx: any,
	employee: Employee,
	activeJob: ActiveJob,
	endAddress: any
): Promise<Employee> {
	// Calculate XP gains
	const drivingXPGain = 10; // Base XP for completing a job
	const newDrivingXP = employee.drivingLevel.xp + drivingXPGain;
	const newDrivingLevel = Math.floor(newDrivingXP / 100) + 1; // Level up every 100 XP

	// Update category XP based on job category
	const categoryXPGain = 5;
	const updatedCategoryLevels = { ...employee.categoryLevel };

	// TODO: Get job category from activeJob and update appropriate category
	// For now, just update a default category

	// Update employee
	const [updatedEmployee] = await tx
		.update(employees)
		.set({
			activeJobId: null, // Clear active job
			location: endAddress
				? {
						id: endAddress.id,
						lat: endAddress.lat,
						lon: endAddress.lon,
						street: endAddress.street,
						houseNumber: endAddress.houseNumber,
						city: endAddress.city,
						postcode: endAddress.postcode
					}
				: employee.location,
			drivingLevel: {
				level: newDrivingLevel,
				xp: newDrivingXP
			},
			categoryLevel: updatedCategoryLevels
		})
		.where(eq(employees.id, employee.id))
		.returning();

	return updatedEmployee;
}
