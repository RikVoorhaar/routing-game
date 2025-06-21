import { db } from './db';
import { employees, routes, gameStates, activeJobs, addresses } from './db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

/**
 * Check for and process any completed active jobs for a given game state
 * This function should be called when loading the game state to ensure
 * all completed jobs are properly processed.
 */
export async function processCompletedRoutes(gameStateId: string): Promise<{
	processedRoutes: number;
	totalReward: number;
}> {
	let processedRoutes = 0;
	let totalReward = 0;

	try {
		// Get all employees with active jobs for this game state
		const employeesWithActiveJobs = await db
			.select({
				employee: employees,
				activeJob: activeJobs,
				jobRoute: routes,
				endAddress: addresses
			})
			.from(employees)
			.innerJoin(activeJobs, eq(employees.id, activeJobs.employeeId))
			.innerJoin(routes, eq(activeJobs.jobRouteId, routes.id))
			.innerJoin(addresses, eq(routes.endAddressId, addresses.id))
			.where(and(eq(employees.gameId, gameStateId), isNotNull(activeJobs.startTime)));

		const currentTime = Date.now();
		const completedJobUpdates: Array<{
			employeeId: string;
			activeJobId: string;
			reward: number;
			endAddress: {
				id: string;
				lat: string;
				lon: string;
				street: string | null;
				houseNumber: string | null;
				city: string | null;
				postcode: string | null;
			};
		}> = [];

		// Check which active jobs are completed
		for (const { employee, activeJob, jobRoute, endAddress } of employeesWithActiveJobs) {
			if (activeJob.endTime) {
				continue; // Skip if already completed
			}

			const jobStartTime = new Date(activeJob.startTime).getTime();

			// Calculate total duration based on current phase
			let totalDuration = 0;

			if (activeJob.currentPhase === 'traveling_to_job' && activeJob.routeToJobId) {
				// Still traveling to job - get duration from modified route data
				const modifiedRouteData = activeJob.modifiedRouteToJobData as any;
				if (modifiedRouteData && modifiedRouteData.travelTimeSeconds) {
					totalDuration = modifiedRouteData.travelTimeSeconds * 1000; // Convert to milliseconds
				}
			} else if (activeJob.currentPhase === 'on_job' || !activeJob.routeToJobId) {
				// On job phase or no travel needed - calculate total time including both phases
				let travelTime = 0;
				if (activeJob.routeToJobId && activeJob.modifiedRouteToJobData) {
					const travelData = activeJob.modifiedRouteToJobData as any;
					if (travelData && travelData.travelTimeSeconds) {
						travelTime = travelData.travelTimeSeconds * 1000;
					}
				}

				const jobData = activeJob.modifiedJobRouteData as any;
				const jobTime = jobData && jobData.travelTimeSeconds ? jobData.travelTimeSeconds * 1000 : 0;

				if (activeJob.currentPhase === 'traveling_to_job') {
					// Still in travel phase
					totalDuration = travelTime;
				} else {
					// In job phase - check if job phase is complete
					const jobPhaseStartTime = activeJob.jobPhaseStartTime
						? new Date(activeJob.jobPhaseStartTime).getTime()
						: jobStartTime + travelTime;
					const jobPhaseElapsed = currentTime - jobPhaseStartTime;

					if (jobPhaseElapsed >= jobTime) {
						// Job phase is complete
						totalDuration = travelTime + jobTime;
					} else {
						// Job phase not complete yet
						continue;
					}
				}
			}

			const elapsed = currentTime - jobStartTime;

			if (elapsed >= totalDuration) {
				// Job is completed
				const rewardNum =
					typeof jobRoute.reward === 'string' ? parseFloat(jobRoute.reward) : jobRoute.reward;

				completedJobUpdates.push({
					employeeId: employee.id,
					activeJobId: activeJob.id,
					reward: rewardNum,
					endAddress: {
						id: endAddress.id,
						lat: endAddress.lat,
						lon: endAddress.lon,
						street: endAddress.street,
						houseNumber: endAddress.houseNumber,
						city: endAddress.city,
						postcode: endAddress.postcode
					}
				});
				totalReward += rewardNum;
				processedRoutes++;
			}
		}

		// Process all completed jobs in a transaction
		if (completedJobUpdates.length > 0) {
			await db.transaction(async (tx) => {
				// Get current game state
				const [gameState] = await tx
					.select()
					.from(gameStates)
					.where(eq(gameStates.id, gameStateId))
					.limit(1);

				if (!gameState) {
					throw new Error('Game state not found');
				}

				// Update each completed job
				for (const update of completedJobUpdates) {
					// Update employee location after job completion
					await tx
						.update(employees)
						.set({
							location: JSON.stringify(update.endAddress)
						})
						.where(eq(employees.id, update.employeeId));

					// Mark the active job as completed
					await tx
						.update(activeJobs)
						.set({ endTime: new Date() })
						.where(eq(activeJobs.id, update.activeJobId));

					// Delete the active job after a brief delay (could be done in a cleanup job later)
					// For now, we'll keep completed jobs for potential debugging
				}

				// Convert string numbers to actual numbers for proper mathematical addition
				const currentMoney =
					typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money;
				const totalRewardNum = totalReward; // totalReward is already a number from the loop above
				const newMoney = currentMoney + totalRewardNum;

				// Update game state with total rewards
				await tx
					.update(gameStates)
					.set({ money: newMoney.toString() }) // Convert back to string for database storage
					.where(eq(gameStates.id, gameStateId));
			});

			console.log(
				`Processed ${processedRoutes} completed active jobs for game ${gameStateId}, total reward: ${totalReward}`
			);
		}

		return { processedRoutes, totalReward };
	} catch (error) {
		console.error('Error processing completed active jobs:', error);
		throw error;
	}
}
