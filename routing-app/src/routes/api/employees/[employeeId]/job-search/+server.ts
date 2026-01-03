import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, activeRoutes, gameStates, jobs, addresses } from '$lib/server/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { getClosestJobsForEmployeeByTier } from '$lib/jobs/queryJobs';
import { computeActiveJob } from '$lib/jobs/activeJobComputation';
import { getVehicleTierByLevel } from '$lib/vehicleUtils';
import { VEHICLE_DEFINITIONS } from '$lib/vehicles/vehicleDefinitions';
import type { UpgradeEffects } from '$lib/server/db/schema';
import { serverLog } from '$lib/server/logging/serverLogger';

/**
 * Performance timing helper - logs at INFO level so it's always visible
 */
function time(label: string): () => void {
	const start = performance.now();
	return () => {
		const duration = performance.now() - start;
		serverLog.api.info({ duration_ms: Math.round(duration * 100) / 100, label }, '⏱️ Timing');
	};
}

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
		const totalTimer = time('total_job_search');
		const { gameStateId } = await request.json();

		if (!gameStateId) {
			return error(400, 'Game state ID is required');
		}

		// Verify the game state belongs to the current user
		const gameStateTimer = time('fetch_game_state');
		const gameState = await db.query.gameStates.findFirst({
			where: and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id))
		});
		gameStateTimer();

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get the employee and verify it belongs to the game state
		const employeeTimer = time('fetch_employee');
		const employee = await db.query.employees.findFirst({
			where: and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId))
		});
		employeeTimer();

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Check if employee has an active job that has been started
		const checkActiveJobTimer = time('check_active_job');
		const startedActiveJob = await db.query.activeJobs.findFirst({
			where: and(
				eq(activeJobs.employeeId, employeeId),
				eq(activeJobs.gameStateId, gameStateId),
				isNull(activeJobs.startTime) === false
			)
		});
		checkActiveJobTimer();

		if (startedActiveJob) {
			return error(409, 'Employee already has an active job in progress');
		}

		// Get jobsPerTier from upgrade effects (default: 2)
		const upgradeEffects = (gameState.upgradeEffects || {}) as UpgradeEffects;
		const jobsPerTier = upgradeEffects.jobsPerTier ?? 2;

		// Get employee's vehicle tier to determine eligible tiers
		const employeeVehicleTier = getVehicleTierByLevel(employee.vehicleLevel, VEHICLE_DEFINITIONS);

		serverLog.api.info(
			{ employeeId, jobsPerTier, employeeVehicleTier, totalJobsExpected: jobsPerTier * employeeVehicleTier },
			'Starting job search'
		);

		// Collect jobs for each eligible tier (1 to employeeVehicleTier) - parallelize tier queries
		const tierQueryTimer = time('tier_queries');
		const tierPromises: Array<Promise<Array<typeof jobs.$inferSelect>>> = [];
		for (let tier = 1; tier <= employeeVehicleTier; tier++) {
			tierPromises.push(getClosestJobsForEmployeeByTier(employee.location, tier, jobsPerTier));
		}
		const tierResults = await Promise.all(tierPromises);
		const allMatchedJobs: Array<{ job: typeof jobs.$inferSelect; tier: number }> = [];
		tierResults.forEach((tierJobs, index) => {
			const tier = index + 1;
			allMatchedJobs.push(...tierJobs.map((job) => ({ job, tier })));
		});
		tierQueryTimer();

		serverLog.api.info({ jobCount: allMatchedJobs.length }, 'Jobs found, computing routes');

		// Pre-fetch all addresses needed for all jobs in one batch query
		const addressFetchTimer = time('batch_fetch_addresses');
		const uniqueAddressIds = new Set<string>();
		allMatchedJobs.forEach(({ job }) => {
			uniqueAddressIds.add(job.startAddressId);
			uniqueAddressIds.add(job.endAddressId);
		});
		
		// Fetch all addresses in a single query using IN clause
		const addressIdsArray = Array.from(uniqueAddressIds);
		const fetchedAddresses = await db
			.select()
			.from(addresses)
			.where(inArray(addresses.id, addressIdsArray));
		
		const addressMap = new Map<string, typeof fetchedAddresses[0]>();
		fetchedAddresses.forEach((addr) => {
			addressMap.set(addr.id, addr);
		});
		addressFetchTimer();

		// Compute active jobs + routes for all matched jobs in parallel (outside transaction)
		// This avoids long-running transactions and allows parallel routing calls
		const routeComputationTimer = time('route_computations');
		const computePromises = allMatchedJobs.map(async ({ job, tier }) => {
			const jobTimer = time(`job_${job.id}_tier_${tier}`);
			try {
				const result = await computeActiveJob(employee, job, gameState, addressMap);
				jobTimer();
				return { job, ...result, success: true };
			} catch (err) {
				jobTimer();
				serverLog.api.error({ jobId: job.id, tier, error: err }, 'Error computing active job');
				return { job, success: false };
			}
		});

		const computedResults = await Promise.all(computePromises);
		routeComputationTimer();
		const successfulComputations = computedResults.filter((r) => r.success) as Array<{
			job: typeof jobs.$inferSelect;
			activeJob: typeof activeJobs.$inferInsert;
			activeRoute: typeof activeRoutes.$inferInsert;
			success: boolean;
		}>;

		serverLog.api.info(
			{ successful: successfulComputations.length, failed: computedResults.length - successfulComputations.length },
			'Route computations complete'
		);

		// Use a transaction to:
		// 1. Delete existing search results (active jobs without startTime) for this employee
		// 2. Insert new active jobs and routes for matched jobs
		const dbTransactionTimer = time('db_transaction');
		const results = await db.transaction(async (tx) => {
			// Delete existing search results (active jobs without startTime)
			const deleteTimer = time('delete_old_results');
			await tx
				.delete(activeJobs)
				.where(
					and(
						eq(activeJobs.employeeId, employeeId),
						eq(activeJobs.gameStateId, gameStateId),
						isNull(activeJobs.startTime)
					)
				);
			deleteTimer();

			// Insert all active jobs and routes in batches
			const insertTimer = time('insert_new_results');
			
			// Batch insert all active jobs at once
			const insertJobsTimer = time('batch_insert_active_jobs');
			if (successfulComputations.length > 0) {
				await tx.insert(activeJobs).values(
					successfulComputations.map((c) => c.activeJob)
				);
			}
			insertJobsTimer();

			// Batch insert all routes at once
			const insertRoutesTimer = time('batch_insert_active_routes');
			if (successfulComputations.length > 0) {
				await tx.insert(activeRoutes).values(
					successfulComputations.map((c) => c.activeRoute)
				);
			}
			insertRoutesTimer();

			// Fetch all inserted active jobs in one query (using IN clause would be better, but Drizzle doesn't support it easily)
			// Instead, we'll just return the data we already have since we inserted it
			const searchResults: Array<{
				job: typeof jobs.$inferSelect;
				activeJob: typeof activeJobs.$inferSelect;
			}> = successfulComputations.map(({ job, activeJob }) => ({
				job,
				activeJob: activeJob as typeof activeJobs.$inferSelect
			}));
			insertTimer();

			return searchResults;
		});
		dbTransactionTimer();

		// Return search results without route geometry
		totalTimer();
		serverLog.api.info({ resultCount: results.length }, 'Job search complete');

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
		return error(
			500,
			`Failed to search jobs: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
};
