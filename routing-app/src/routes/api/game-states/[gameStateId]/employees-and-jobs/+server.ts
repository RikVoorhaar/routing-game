import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, travelJobs, addresses } from '$lib/server/db/schema';
import type { FullEmployeeData } from '$lib/server/db/schema';
import { eq, and, isNotNull, inArray, asc } from 'drizzle-orm';
import { processCompletedJobs } from '$lib/jobs/jobCompletion';
import { log } from '$lib/logger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { gameStateId } = params;

	try {
		log.api.debug(
			{
				event: 'employees_and_jobs.load.start',
				game_state_id: gameStateId
			},
			`Loading data for game state: ${gameStateId}`
		);

		// First, process any completed jobs
		const completionResult = await processCompletedJobs(gameStateId);

		if (completionResult.processedJobs > 0) {
			log.api.debug(
				{
					event: 'employees_and_jobs.jobs.processed',
					game_state_id: gameStateId,
					processed_jobs: completionResult.processedJobs
				},
				`Processed ${completionResult.processedJobs} completed jobs`
			);
		}

		// Get all employees for this game state, ordered by hire order
		const allEmployees = await db
			.select()
			.from(employees)
			.where(eq(employees.gameId, gameStateId))
			.orderBy(asc(employees.order));

		// Get all active jobs for this game state
		const activeJobsData = await db
			.select()
			.from(activeJobs)
			.where(and(eq(activeJobs.gameStateId, gameStateId), isNotNull(activeJobs.startTime)));

		// Get all travel jobs for this game state
		const travelJobsData = await db
			.select()
			.from(travelJobs)
			.where(and(eq(travelJobs.gameStateId, gameStateId), isNotNull(travelJobs.startTime)));

		// If there are no active jobs or travel jobs, return early with empty data
		if (activeJobsData.length === 0 && travelJobsData.length === 0) {
			const fullEmployeeData: FullEmployeeData[] = allEmployees.map((employee) => ({
				employee,
				activeJob: null,
				employeeStartLocation: null,
				jobPickupAddress: null,
				jobDeliverAddress: null,
				activeRoute: null,
				travelJob: null
			}));

			return json({
				success: true,
				fullEmployeeData,
				gameState: completionResult.updatedGameState,
				processedJobs: completionResult.processedJobs,
				totalReward: completionResult.totalReward
			});
		}

		// Get all unique address IDs from active jobs (employeeStartLocation is now Coordinate JSONB, not an address ID)
		const addressIds = new Set<string>();
		activeJobsData.forEach((job) => {
			addressIds.add(job.jobPickupAddress);
			addressIds.add(job.jobDeliverAddress);
		});

		// Get all addresses (routes are now fetched on-demand via /api/active-routes/[activeJobId])
		const addressesData = await db
			.select()
			.from(addresses)
			.where(inArray(addresses.id, Array.from(addressIds)));

		// Create maps for quick lookup
		const addressMap = new Map(addressesData.map((addr) => [addr.id, addr]));

		// Create FullEmployeeData array
		const fullEmployeeData: FullEmployeeData[] = allEmployees.map((employee) => {
			const activeJob = activeJobsData.find((job) => job.employeeId === employee.id) || null;
			const travelJob = travelJobsData.find((job) => job.employeeId === employee.id) || null;

			if (!activeJob) {
				return {
					employee,
					activeJob: null,
					employeeStartLocation: null,
					jobPickupAddress: null,
					jobDeliverAddress: null,
					activeRoute: null,
					travelJob
				};
			}

			return {
				employee,
				activeJob,
				employeeStartLocation: activeJob.employeeStartLocation,
				jobPickupAddress: addressMap.get(activeJob.jobPickupAddress) || null,
				jobDeliverAddress: addressMap.get(activeJob.jobDeliverAddress) || null,
				activeRoute: null, // Routes are now fetched on-demand via /api/active-routes/[activeJobId]
				travelJob
			};
		});

		const activeJobsCount = fullEmployeeData.filter((fed) => fed.activeJob).length;
		log.api.debug(
			{
				event: 'employees_and_jobs.load.complete',
				game_state_id: gameStateId,
				employee_count: allEmployees.length,
				active_jobs_count: activeJobsCount
			},
			`Loaded ${allEmployees.length} employees and ${activeJobsCount} active jobs`
		);

		return json({
			success: true,
			fullEmployeeData,
			gameState: completionResult.updatedGameState,
			processedJobs: completionResult.processedJobs,
			totalReward: completionResult.totalReward
		});
	} catch (error) {
		log.api.error(
			{
				event: 'employees_and_jobs.load.error',
				game_state_id: gameStateId,
				err:
					error instanceof Error
						? {
								name: error.name,
								message: error.message,
								stack: error.stack
							}
						: error
			},
			'Error loading employee data'
		);
		const message = error instanceof Error ? error.message : 'Failed to load employee data';
		return json({ message }, { status: 500 });
	}
};
