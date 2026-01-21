import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, travelJobs, places } from '$lib/server/db/schema';
import type { FullEmployeeData } from '$lib/server/db/schema';
import { eq, and, isNotNull, inArray, asc } from 'drizzle-orm';
import { processCompletedJobs } from '$lib/jobs/jobCompletion';
import { refreshSeedIfNeeded } from '$lib/server/gameState/seedRefresh';
import { config } from '$lib/server/config';
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

		// Refresh seed if needed before processing jobs
		await refreshSeedIfNeeded(gameStateId, config.game.seedRefreshHours);

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
				jobPickupPlace: null,
				jobDeliverPlace: null,
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

		// Get all unique place IDs from active jobs
		const placeIds = new Set<number>();
		activeJobsData.forEach((job) => {
			placeIds.add(job.jobPickupPlaceId);
			placeIds.add(job.jobDeliverPlaceId);
		});

		// Get all places (routes are now fetched on-demand via /api/active-routes/[activeJobId])
		const placesData = await db
			.select()
			.from(places)
			.where(inArray(places.id, Array.from(placeIds)));

		// Create maps for quick lookup
		const placeMap = new Map(placesData.map((place) => [place.id, place]));

		// Create FullEmployeeData array
		const fullEmployeeData: FullEmployeeData[] = allEmployees.map((employee) => {
			const activeJob = activeJobsData.find((job) => job.employeeId === employee.id) || null;
			const travelJob = travelJobsData.find((job) => job.employeeId === employee.id) || null;

			if (!activeJob) {
				return {
					employee,
					activeJob: null,
					employeeStartLocation: null,
					jobPickupPlace: null,
					jobDeliverPlace: null,
					activeRoute: null,
					travelJob
				};
			}

			return {
				employee,
				activeJob,
				employeeStartLocation: activeJob.employeeStartLocation,
				jobPickupPlace: placeMap.get(activeJob.jobPickupPlaceId) || null,
				jobDeliverPlace: placeMap.get(activeJob.jobDeliverPlaceId) || null,
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
