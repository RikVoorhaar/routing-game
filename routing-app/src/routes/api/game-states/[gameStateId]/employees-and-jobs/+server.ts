import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, addresses, activeRoutes } from '$lib/server/db/schema';
import type { FullEmployeeData } from '$lib/server/db/schema';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import { processCompletedJobs } from '$lib/jobs/jobCompletion';
import { log } from '$lib/logger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { gameStateId } = params;

	try {
		log.debug('[EmployeesAndJobs] Loading data for game state:', gameStateId);

		// First, process any completed jobs
		const completionResult = await processCompletedJobs(gameStateId);

		if (completionResult.processedJobs > 0) {
			log.debug('[EmployeesAndJobs] Processed', completionResult.processedJobs, 'completed jobs');
		}

		// Get all employees for this game state
		const allEmployees = await db.select().from(employees).where(eq(employees.gameId, gameStateId));

		// Get all active jobs for this game state
		const activeJobsData = await db
			.select()
			.from(activeJobs)
			.where(and(eq(activeJobs.gameStateId, gameStateId), isNotNull(activeJobs.startTime)));

		// If there are no active jobs, return early with empty data
		if (activeJobsData.length === 0) {
			const fullEmployeeData: FullEmployeeData[] = allEmployees.map((employee) => ({
				employee,
				activeJob: null,
				employeeStartAddress: null,
				jobAddress: null,
				employeeEndAddress: null,
				activeRoute: null
			}));

			return json({
				success: true,
				fullEmployeeData,
				gameState: completionResult.updatedGameState,
				processedJobs: completionResult.processedJobs,
				totalReward: completionResult.totalReward
			});
		}

		// Get all unique address IDs from active jobs
		const addressIds = new Set<string>();
		activeJobsData.forEach((job) => {
			addressIds.add(job.employeeStartAddressId);
			addressIds.add(job.jobAddressId);
			addressIds.add(job.employeeEndAddressId);
		});

		// Get all addresses and active routes in parallel
		const [addressesData, activeRoutesData] = await Promise.all([
			db
				.select()
				.from(addresses)
				.where(inArray(addresses.id, Array.from(addressIds))),
			db
				.select()
				.from(activeRoutes)
				.where(
					inArray(
						activeRoutes.activeJobId,
						activeJobsData.map((job) => job.id)
					)
				)
		]);

		// Create maps for quick lookup
		const addressMap = new Map(addressesData.map((addr) => [addr.id, addr]));
		const activeRouteMap = new Map(activeRoutesData.map((route) => [route.activeJobId, route]));

		// Create FullEmployeeData array
		const fullEmployeeData: FullEmployeeData[] = allEmployees.map((employee) => {
			const activeJob = activeJobsData.find((job) => job.employeeId === employee.id) || null;

			if (!activeJob) {
				return {
					employee,
					activeJob: null,
					employeeStartAddress: null,
					jobAddress: null,
					employeeEndAddress: null,
					activeRoute: null
				};
			}

			return {
				employee,
				activeJob,
				employeeStartAddress: addressMap.get(activeJob.employeeStartAddressId) || null,
				jobAddress: addressMap.get(activeJob.jobAddressId) || null,
				employeeEndAddress: addressMap.get(activeJob.employeeEndAddressId) || null,
				activeRoute: activeRouteMap.get(activeJob.id) || null
			};
		});

		log.debug(
			'[EmployeesAndJobs] Loaded',
			allEmployees.length,
			'employees and',
			fullEmployeeData.filter((fed) => fed.activeJob).length,
			'active jobs'
		);

		return json({
			success: true,
			fullEmployeeData,
			gameState: completionResult.updatedGameState,
			processedJobs: completionResult.processedJobs,
			totalReward: completionResult.totalReward
		});
	} catch (error) {
		log.error('[EmployeesAndJobs] Error loading data:', error);
		const message = error instanceof Error ? error.message : 'Failed to load employee data';
		return json({ message }, { status: 500 });
	}
};
