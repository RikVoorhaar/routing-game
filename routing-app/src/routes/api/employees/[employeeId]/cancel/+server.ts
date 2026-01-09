import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, travelJobs, gameStates, jobs, addresses } from '$lib/server/db/schema';
import { eq, inArray, and, isNotNull } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { getRoute as getActiveRoute, deleteRoute as deleteActiveRoute } from '$lib/server/routeCache/activeRouteCache';
import { getRoute as getTravelRoute, deleteRoute as deleteTravelRoute } from '$lib/server/routeCache/travelRouteCache';
import { computeActiveRouteForActiveJob } from '$lib/server/routes/activeRouteCompute';
import { getShortestPath } from '$lib/routes/routing';
import { applyMaxSpeed } from '$lib/routes/route-utils';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
import { gzipSync, gunzipSync } from 'zlib';
import type { RoutingResult, Coordinate, ActiveJob, TravelJob, Employee, GameState } from '$lib/server/db/schema';
import { interpolateLocationAtTime } from '$lib/routes/routing-client';

/**
 * Compute route data for an active job if not found in cache
 */
async function computeRouteForActiveJob(
	activeJob: ActiveJob,
	employee: Employee,
	gameState: GameState
): Promise<Buffer> {
	serverLog.api.info({ activeJobId: activeJob.id }, 'Route not found in cache, computing on-demand');

	// Fetch job and employee data needed for route computation
	const job = await db.query.jobs.findFirst({
		where: eq(jobs.id, activeJob.jobId)
	});

	if (!job) {
		serverLog.api.error({ activeJobId: activeJob.id, jobId: activeJob.jobId }, 'Job not found');
		throw new Error('Job not found');
	}

	// Pre-fetch addresses for performance
	const addressIds = [job.startAddressId, job.endAddressId];
	const fetchedAddresses = await db
		.select()
		.from(addresses)
		.where(inArray(addresses.id, addressIds));

	const addressMap = new Map<string, (typeof fetchedAddresses)[0]>();
	fetchedAddresses.forEach((addr) => {
		addressMap.set(addr.id, addr);
	});

	// Compute the route
	const { routeDataGzip } = await computeActiveRouteForActiveJob(
		activeJob.id,
		{
			employeeStartLocation: activeJob.employeeStartLocation,
			jobPickupAddress: activeJob.jobPickupAddress,
			jobDeliverAddress: activeJob.jobDeliverAddress
		},
		job,
		employee,
		gameState,
		addressMap
	);

	return routeDataGzip;
}

/**
 * Get route data for an active job (from cache or compute if missing)
 */
async function getRouteDataForActiveJob(
	activeJob: ActiveJob,
	employee: Employee,
	gameState: GameState
): Promise<RoutingResult> {
	// Fetch route from cache
	let routeDataGzip = await getActiveRoute(activeJob.id);

	// Compute if not in cache
	if (!routeDataGzip) {
		routeDataGzip = await computeRouteForActiveJob(activeJob, employee, gameState);
	}

	// Decompress route data
	const decompressed = gunzipSync(routeDataGzip);
	return JSON.parse(decompressed.toString('utf-8')) as RoutingResult;
}

/**
 * Compute route data for a travel job if not found in cache
 */
async function computeRouteForTravelJob(
	travelJob: TravelJob,
	employee: Employee
): Promise<Buffer> {
	serverLog.api.info({ travelJobId: travelJob.id }, 'Route not found in cache, computing on-demand');

	// Compute the route using getShortestPath
	const routeResult = await getShortestPath(
		travelJob.employeeStartLocation,
		travelJob.destinationLocation
	);

	// Apply speed multiplier and max speed
	const employeeMaxSpeed = getEmployeeMaxSpeed(employee);
	const speedMultiplier = config.dev.speedMultiplier;
	const modifiedRoute = applyMaxSpeed(routeResult, employeeMaxSpeed, speedMultiplier);

	// Store full route data structure
	const computedRouteData: RoutingResult = {
		path: modifiedRoute.path,
		travelTimeSeconds: modifiedRoute.travelTimeSeconds,
		totalDistanceMeters: modifiedRoute.totalDistanceMeters,
		destination: {
			id: 'travel-destination',
			street: null,
			houseNumber: null,
			postcode: null,
			city: null,
			location: `POINT(${travelJob.destinationLocation.lon} ${travelJob.destinationLocation.lat})`,
			lat: travelJob.destinationLocation.lat,
			lon: travelJob.destinationLocation.lon,
			createdAt: new Date()
		}
	};

	// Compress route data
	const routeDataJson = JSON.stringify(computedRouteData);
	return gzipSync(routeDataJson);
}

/**
 * Get route data for a travel job (from cache or compute if missing)
 */
async function getRouteDataForTravelJob(
	travelJob: TravelJob,
	employee: Employee
): Promise<RoutingResult> {
	// Fetch route from cache
	let routeDataGzip = await getTravelRoute(travelJob.id);

	// Compute if not in cache
	if (!routeDataGzip) {
		routeDataGzip = await computeRouteForTravelJob(travelJob, employee);
	}

	// Decompress route data
	const decompressed = gunzipSync(routeDataGzip);
	return JSON.parse(decompressed.toString('utf-8')) as RoutingResult;
}

// POST /api/employees/[employeeId]/cancel - Cancel active job or travel and update employee location
export const POST: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const { employeeId } = params;

	if (!employeeId) {
		return error(400, 'Employee ID is required');
	}

	try {
		serverLog.api.info({ employeeId }, 'Canceling employee job/travel');

		// Get the employee and verify ownership
		const employee = await db.query.employees.findFirst({
			where: eq(employees.id, employeeId)
		});

		if (!employee) {
			serverLog.api.warn({ employeeId }, 'Employee not found');
			return error(404, 'Employee not found');
		}

		// Get the game state to verify ownership
		const gameState = await db.query.gameStates.findFirst({
			where: eq(gameStates.id, employee.gameId)
		});

		if (!gameState) {
			serverLog.api.warn({ employeeId, gameStateId: employee.gameId }, 'Game state not found');
			return error(404, 'Game state not found');
		}

		if (gameState.userId !== session.user.id) {
			serverLog.api.warn(
				{ employeeId, userId: session.user.id, gameStateUserId: gameState.userId },
				'Access denied'
			);
			return error(403, 'Access denied');
		}

		// Check for active job or travel job (only ones that have been started - startTime IS NOT NULL)
		// Active jobs without startTime are just search results, not actual jobs in progress
		const [activeJob, travelJob] = await Promise.all([
			db.query.activeJobs.findFirst({
				where: and(eq(activeJobs.employeeId, employeeId), isNotNull(activeJobs.startTime))
			}),
			db.query.travelJobs.findFirst({
				where: and(eq(travelJobs.employeeId, employeeId), isNotNull(travelJobs.startTime))
			})
		]);

		// Early return if no active job or travel job
		if (!activeJob && !travelJob) {
			serverLog.api.warn({ employeeId }, 'Employee has no active job or travel to cancel');
			return error(400, 'Employee is idle and has no active job or travel to cancel');
		}

		// Handle active job cancellation
		if (activeJob) {
			const routeId = activeJob.id;
			const startTime = new Date(activeJob.startTime!);

			// Get route data
			let routeData: RoutingResult;
			try {
				routeData = await getRouteDataForActiveJob(activeJob, employee, gameState);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				serverLog.api.error({ employeeId, activeJobId: routeId, error: errorMessage }, 'Failed to get route data');
				return error(500, `Failed to get route data: ${errorMessage}`);
			}

			// Compute current position
			let currentPosition: Coordinate;
			if (!routeData || !routeData.path || routeData.path.length === 0) {
				serverLog.api.error({ employeeId, routeId }, 'Invalid route data: missing or empty path');
				currentPosition = activeJob.employeeStartLocation;
			} else {
				const elapsedSeconds = (Date.now() - startTime.getTime()) / 1000;
				const interpolatedPosition = interpolateLocationAtTime(routeData.path, elapsedSeconds);

				if (!interpolatedPosition) {
					serverLog.api.warn(
						{ employeeId, routeId, elapsedSeconds },
						'Interpolation failed, using start location'
					);
					currentPosition = activeJob.employeeStartLocation;
				} else {
					currentPosition = interpolatedPosition;
				}
			}

			// Update employee location and delete active job in a transaction
			await db.transaction(async (tx) => {
				await tx
					.update(employees)
					.set({ location: currentPosition })
					.where(eq(employees.id, employeeId));

				await tx.delete(activeJobs).where(eq(activeJobs.id, routeId));
			});

			// Clear route cache
			await deleteActiveRoute(routeId);

			serverLog.api.info(
				{ employeeId, routeId, position: currentPosition, jobType: 'activeJob' },
				'Employee job canceled successfully'
			);

			return json({ success: true, position: currentPosition });
		}

		// Handle travel job cancellation
		if (travelJob) {
			const routeId = travelJob.id;
			const startTime = new Date(travelJob.startTime!);

			// Get route data
			let routeData: RoutingResult;
			try {
				routeData = await getRouteDataForTravelJob(travelJob, employee);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				serverLog.api.error({ employeeId, travelJobId: routeId, error: errorMessage }, 'Failed to get route data');
				return error(500, `Failed to get route data: ${errorMessage}`);
			}

			// Compute current position
			let currentPosition: Coordinate;
			if (!routeData || !routeData.path || routeData.path.length === 0) {
				serverLog.api.error({ employeeId, routeId }, 'Invalid route data: missing or empty path');
				currentPosition = travelJob.employeeStartLocation;
			} else {
				const elapsedSeconds = (Date.now() - startTime.getTime()) / 1000;
				const interpolatedPosition = interpolateLocationAtTime(routeData.path, elapsedSeconds);

				if (!interpolatedPosition) {
					serverLog.api.warn(
						{ employeeId, routeId, elapsedSeconds },
						'Interpolation failed, using start location'
					);
					currentPosition = travelJob.employeeStartLocation;
				} else {
					currentPosition = interpolatedPosition;
				}
			}

			// Update employee location and delete travel job in a transaction
			await db.transaction(async (tx) => {
				await tx
					.update(employees)
					.set({ location: currentPosition })
					.where(eq(employees.id, employeeId));

				await tx.delete(travelJobs).where(eq(travelJobs.id, routeId));
			});

			// Clear route cache
			await deleteTravelRoute(routeId);

			serverLog.api.info(
				{ employeeId, routeId, position: currentPosition, jobType: 'travelJob' },
				'Employee travel canceled successfully'
			);

			return json({ success: true, position: currentPosition });
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				employeeId,
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error canceling employee job/travel'
		);
		return error(500, `Failed to cancel job/travel: ${errorMessage}`);
	}
};
