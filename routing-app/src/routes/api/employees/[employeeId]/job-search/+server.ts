import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, activeRoutes, gameStates, jobs } from '$lib/server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getClosestJobsForEmployeeByTier } from '$lib/jobs/queryJobs';
import { computeActiveJob } from '$lib/jobs/activeJobComputation';
import { getVehicleTierByLevel } from '$lib/vehicleUtils';
import { VEHICLE_DEFINITIONS } from '$lib/vehicles/vehicleDefinitions';
import type { UpgradeEffects } from '$lib/server/db/schema';

/**
 * POST /api/employees/[employeeId]/job-search
 * Search for closest X jobs per eligible tier for an employee
 * Clears existing search results and creates new active jobs with routes
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const { employeeId } = params;

	if (!employeeId) {
		return error(400, 'Employee ID is required');
	}

	try {
		const { gameStateId } = await request.json();

		if (!gameStateId) {
			return error(400, 'Game state ID is required');
		}

		// Verify the game state belongs to the current user
		const gameState = await db.query.gameStates.findFirst({
			where: and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id))
		});

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get the employee and verify it belongs to the game state
		const employee = await db.query.employees.findFirst({
			where: and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId))
		});

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Check if employee has an active job that has been started
		const startedActiveJob = await db.query.activeJobs.findFirst({
			where: and(
				eq(activeJobs.employeeId, employeeId),
				eq(activeJobs.gameStateId, gameStateId),
				isNull(activeJobs.startTime) === false
			)
		});

		if (startedActiveJob) {
			return error(409, 'Employee already has an active job in progress');
		}

		// Get jobsPerTier from upgrade effects (default: 2)
		const upgradeEffects = (gameState.upgradeEffects || {}) as UpgradeEffects;
		const jobsPerTier = upgradeEffects.jobsPerTier ?? 2;

		// Get employee's vehicle tier to determine eligible tiers
		const employeeVehicleTier = getVehicleTierByLevel(
			employee.vehicleLevel,
			VEHICLE_DEFINITIONS
		);

		// Collect jobs for each eligible tier (1 to employeeVehicleTier)
		const allMatchedJobs: Array<{ job: typeof jobs.$inferSelect; tier: number }> = [];

		for (let tier = 1; tier <= employeeVehicleTier; tier++) {
			const tierJobs = await getClosestJobsForEmployeeByTier(
				employee.location,
				tier,
				jobsPerTier
			);
			allMatchedJobs.push(...tierJobs.map((job) => ({ job, tier })));
		}

		// Use a transaction to:
		// 1. Delete existing search results (active jobs without startTime) for this employee
		// 2. Create new active jobs and routes for matched jobs
		const results = await db.transaction(async (tx) => {
			// Delete existing search results (active jobs without startTime)
			await tx
				.delete(activeJobs)
				.where(
					and(
						eq(activeJobs.employeeId, employeeId),
						eq(activeJobs.gameStateId, gameStateId),
						isNull(activeJobs.startTime)
					)
				);

			// Compute and insert active jobs + routes for each matched job
			const searchResults: Array<{
				job: typeof jobs.$inferSelect;
				activeJob: typeof activeJobs.$inferSelect;
			}> = [];

			for (const { job } of allMatchedJobs) {
				try {
					const { activeJob, activeRoute } = await computeActiveJob(employee, job, gameState);

					// Insert active job and route
					await tx.insert(activeJobs).values(activeJob);
					await tx.insert(activeRoutes).values(activeRoute);

					// Fetch the inserted active job to return complete data
					const insertedActiveJob = await tx.query.activeJobs.findFirst({
						where: eq(activeJobs.id, activeJob.id)
					});

					if (insertedActiveJob) {
						searchResults.push({
							job,
							activeJob: insertedActiveJob
						});
					}
				} catch (err) {
					console.error(`Error computing active job for job ${job.id}:`, err);
					// Continue with other jobs even if one fails
				}
			}

			return searchResults;
		});

		// Return search results without route geometry
		return json({
			results: results.map((r) => ({
				job: r.job,
				activeJob: {
					id: r.activeJob.id,
					employeeId: r.activeJob.employeeId,
					jobId: r.activeJob.jobId,
					gameStateId: r.activeJob.gameStateId,
					durationSeconds: r.activeJob.durationSeconds,
					reward: r.activeJob.reward,
					xp: r.activeJob.xp,
					jobCategory: r.activeJob.jobCategory,
					employeeStartLocation: r.activeJob.employeeStartLocation,
					jobPickupAddress: r.activeJob.jobPickupAddress,
					jobDeliverAddress: r.activeJob.jobDeliverAddress,
					generatedTime: r.activeJob.generatedTime
					// Note: startTime is not included since these are search results
				}
			})),
			jobsPerTier,
			tiersSearched: Array.from({ length: employeeVehicleTier }, (_, i) => i + 1)
		});
	} catch (err) {
		console.error('Error searching jobs:', err);
		return error(500, `Failed to search jobs: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
};
