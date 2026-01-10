import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { travelJobs, gameStates, employees } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { getRoute, setRoute } from '$lib/server/routeCache/travelRouteCache';
import { getShortestPath } from '$lib/routes/routing';
import { applyMaxSpeed } from '$lib/routes/route-utils';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
import { gzipSync } from 'zlib';
import type { RoutingResult } from '$lib/server/db/schema';

// GET /api/travel/[travelJobId] - Get gzipped route data for an active travel job
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const travelJobId = params.travelJobId;

	if (!travelJobId) {
		return error(400, 'Travel job ID is required');
	}

	try {
		serverLog.api.info({ travelJobId }, 'Fetching travel route');

		// Get the travel job
		const travelJob = await db.query.travelJobs.findFirst({
			where: eq(travelJobs.id, travelJobId)
		});

		if (!travelJob) {
			serverLog.api.warn({ travelJobId }, 'Travel job not found');
			return error(404, 'Travel job not found');
		}

		// Get the game state to verify ownership
		const gameState = await db.query.gameStates.findFirst({
			where: eq(gameStates.id, travelJob.gameStateId)
		});

		if (!gameState) {
			serverLog.api.warn(
				{ travelJobId, gameStateId: travelJob.gameStateId },
				'Game state not found'
			);
			return error(404, 'Game state not found');
		}

		// Verify the game state belongs to the current user
		if (gameState.userId !== session.user.id) {
			serverLog.api.warn(
				{ travelJobId, userId: session.user.id, gameStateUserId: gameState.userId },
				'Access denied'
			);
			return error(403, 'Access denied');
		}

		// Check Redis cache first
		let routeDataGzip = await getRoute(travelJobId);

		// If route doesn't exist in cache, compute it on-demand
		if (!routeDataGzip) {
			serverLog.api.info({ travelJobId }, 'Route not found in cache, computing on-demand');

			// Get employee for speed calculations
			const employee = await db.query.employees.findFirst({
				where: eq(employees.id, travelJob.employeeId)
			});

			if (!employee) {
				serverLog.api.warn({ travelJobId, employeeId: travelJob.employeeId }, 'Employee not found');
				return error(404, 'Employee not found');
			}

			// Compute the route using getShortestPath
			const routeResult = await getShortestPath(
				travelJob.employeeStartLocation,
				travelJob.destinationLocation
			);

			// Apply speed multiplier and max speed (same logic as active jobs)
			const employeeMaxSpeed = getEmployeeMaxSpeed(employee);
			const speedMultiplier = config.dev.speedMultiplier; // TODO: add employee/gameState multipliers
			const modifiedRoute = applyMaxSpeed(routeResult, employeeMaxSpeed, speedMultiplier);

			// Store full route data structure (not just path) for proper display
			const routeData: RoutingResult = {
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

			// Compress full route data
			const routeDataJson = JSON.stringify(routeData);
			routeDataGzip = gzipSync(routeDataJson);

			// Store the computed route in Redis with 24h TTL
			const ttlSeconds = 24 * 3600; // 24 hours
			await setRoute(travelJobId, routeDataGzip, ttlSeconds);

			serverLog.api.info(
				{ travelJobId, dataLength: routeDataGzip.length },
				'Route computed and stored in Redis'
			);
		} else {
			serverLog.api.info(
				{ travelJobId, dataLength: routeDataGzip.length },
				'Route retrieved from Redis cache'
			);
		}

		if (!routeDataGzip || routeDataGzip.length === 0) {
			serverLog.api.error(
				{ travelJobId, bufferLength: routeDataGzip?.length },
				'Empty route data buffer'
			);
			return error(500, 'Route data is empty');
		}

		serverLog.api.info({ travelJobId, dataLength: routeDataGzip.length }, 'Returning route data');

		// Return gzip data with Content-Encoding header
		return new Response(routeDataGzip, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Encoding': 'gzip'
			}
		});
	} catch (err) {
		serverLog.api.error(
			{
				travelJobId,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error fetching travel route'
		);
		return error(
			500,
			`Failed to fetch travel route: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
