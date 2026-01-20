import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, gameStates, places } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { getShortestPath } from '$lib/routes/routing';
import { applyMaxSpeed } from '$lib/routes/route-utils';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
import type { Coordinate } from '$lib/server/db/schema';

// POST /api/routes/compute
// Body: { employeeId, startPlaceId, endPlaceId }
// Returns route data for display
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { employeeId, startPlaceId, endPlaceId } = await request.json();

		if (!employeeId || !startPlaceId || !endPlaceId) {
			return error(400, 'Employee ID, start place ID, and end place ID are required');
		}

		serverLog.api.info({ employeeId, startPlaceId, endPlaceId }, 'Computing route between places');

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

		// Verify the game state belongs to the current user
		if (gameState.userId !== session.user.id) {
			serverLog.api.warn(
				{ employeeId, userId: session.user.id, gameStateUserId: gameState.userId },
				'Access denied'
			);
			return error(403, 'Access denied');
		}

		// Get place locations from database
		const [startPlace, endPlace] = await Promise.all([
			db.query.places.findFirst({
				where: eq(places.id, startPlaceId)
			}),
			db.query.places.findFirst({
				where: eq(places.id, endPlaceId)
			})
		]);

		if (!startPlace) {
			serverLog.api.warn({ startPlaceId }, 'Start place not found');
			return error(404, 'Start place not found');
		}

		if (!endPlace) {
			serverLog.api.warn({ endPlaceId }, 'End place not found');
			return error(404, 'End place not found');
		}

		// Validate place coordinates
		if (
			typeof startPlace.lat !== 'number' ||
			typeof startPlace.lon !== 'number' ||
			isNaN(startPlace.lat) ||
			isNaN(startPlace.lon) ||
			startPlace.lat < -90 ||
			startPlace.lat > 90 ||
			startPlace.lon < -180 ||
			startPlace.lon > 180
		) {
			serverLog.api.warn(
				{ startPlaceId, lat: startPlace.lat, lon: startPlace.lon },
				'Invalid start place coordinates'
			);
			return error(400, 'Invalid start place coordinates');
		}

		if (
			typeof endPlace.lat !== 'number' ||
			typeof endPlace.lon !== 'number' ||
			isNaN(endPlace.lat) ||
			isNaN(endPlace.lon) ||
			endPlace.lat < -90 ||
			endPlace.lat > 90 ||
			endPlace.lon < -180 ||
			endPlace.lon > 180
		) {
			serverLog.api.warn(
				{ endPlaceId, lat: endPlace.lat, lon: endPlace.lon },
				'Invalid end place coordinates'
			);
			return error(400, 'Invalid end place coordinates');
		}

		// Compute the route using getShortestPath
		const from: Coordinate = { lat: startPlace.lat, lon: startPlace.lon };
		const to: Coordinate = { lat: endPlace.lat, lon: endPlace.lon };

		serverLog.api.info({ employeeId, from, to }, 'Computing route');
		const routeResult = await getShortestPath(from, to);

		// Apply speed multiplier and max speed (same logic as active jobs)
		const employeeMaxSpeed = getEmployeeMaxSpeed(employee);
		const speedMultiplier = config.dev.speedMultiplier; // TODO: add employee/gameState multipliers
		const modifiedRoute = applyMaxSpeed(routeResult, employeeMaxSpeed, speedMultiplier);

		serverLog.api.info(
			{
				employeeId,
				startPlaceId,
				endPlaceId,
				pathLength: modifiedRoute.path.length,
				travelTimeSeconds: modifiedRoute.travelTimeSeconds,
				totalDistanceMeters: modifiedRoute.totalDistanceMeters,
				speedMultiplier
			},
			'Route computed successfully'
		);

		// Return route data
		return json({
			success: true,
			path: modifiedRoute.path,
			travelTimeSeconds: modifiedRoute.travelTimeSeconds,
			totalDistanceMeters: modifiedRoute.totalDistanceMeters,
			startLocation: from,
			endLocation: to
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error computing route'
		);

		// Check if it's a routing error (no route found)
		if (errorMessage.includes('Failed to get shortest path') || errorMessage.includes('no route')) {
			return json({
				success: false,
				error: 'No route found between places'
			});
		}

		return error(500, `Failed to compute route: ${errorMessage}`);
	}
};
