import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, gameStates, travelJobs, activeJobs } from '$lib/server/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { setRoute } from '$lib/server/routeCache/travelRouteCache';
import { nanoid } from 'nanoid';
import { gzipSync } from 'zlib';
import type { Coordinate, PathPoint, RoutingResult } from '$lib/server/db/schema';

// POST /api/travel/start - Start a travel job
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { employeeId, gameStateId, destinationCoordinate, routePath, durationSeconds } =
			await request.json();

		if (!employeeId || !gameStateId || !destinationCoordinate || !routePath || !durationSeconds) {
			return error(400, 'Missing required fields');
		}

		// Verify the game state belongs to the current user
		const gameState = await db.query.gameStates.findFirst({
			where: eq(gameStates.id, gameStateId)
		});

		if (!gameState) {
			return error(404, 'Game state not found');
		}

		if (gameState.userId !== session.user.id) {
			return error(403, 'Access denied');
		}

		// Get the employee and verify ownership
		const employee = await db.query.employees.findFirst({
			where: and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId))
		});

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Check if employee has an active job (must be idle to travel)
		const activeJob = await db.query.activeJobs.findFirst({
			where: and(eq(activeJobs.employeeId, employeeId), isNotNull(activeJobs.startTime))
		});

		if (activeJob) {
			return error(400, 'Employee must be idle to travel');
		}

		// Get employee's current location
		let employeeStartLocation: Coordinate;
		if (typeof employee.location === 'string') {
			employeeStartLocation = JSON.parse(employee.location);
		} else {
			employeeStartLocation = employee.location as Coordinate;
		}

		// Generate travel job ID
		const travelJobId = nanoid();

		// Create travel job record
		const startTime = new Date();
		const travelJob = {
			id: travelJobId,
			employeeId,
			gameStateId,
			destinationLocation: destinationCoordinate as Coordinate,
			startTime,
			durationSeconds,
			employeeStartLocation
		};

		// Store full route data structure (not just path) for proper display
		const routeData: RoutingResult = {
			path: routePath as PathPoint[],
			travelTimeSeconds: durationSeconds,
			totalDistanceMeters: 0, // Will be calculated from path if needed
			destination: {
				id: 'travel-destination',
				street: null,
				houseNumber: null,
				postcode: null,
				city: null,
				location: `POINT(${destinationCoordinate.lon} ${destinationCoordinate.lat})`,
				lat: destinationCoordinate.lat,
				lon: destinationCoordinate.lon,
				createdAt: new Date()
			}
		};

		// Calculate total distance from path if available
		if (routePath && routePath.length > 0) {
			const lastPoint = routePath[routePath.length - 1];
			if (lastPoint.cumulative_distance_meters) {
				routeData.totalDistanceMeters = lastPoint.cumulative_distance_meters;
			}
		}

		// Compress full route data
		const routeDataJson = JSON.stringify(routeData);
		const routeDataGzip = gzipSync(routeDataJson);

		// Store in database and Redis in a transaction
		await db.transaction(async (tx) => {
			// Insert travel job
			await tx.insert(travelJobs).values(travelJob);

			// Store gzipped route in Redis (24h TTL)
			const ttlSeconds = 24 * 3600; // 24 hours
			await setRoute(travelJobId, routeDataGzip, ttlSeconds);
		});

		serverLog.api.info(
			{
				travelJobId,
				employeeId,
				durationSeconds,
				routeDataLength: routeDataGzip.length
			},
			'Travel job created'
		);

		return json({ travelJob });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error starting travel job'
		);
		return error(500, `Failed to start travel: ${errorMessage}`);
	}
};
