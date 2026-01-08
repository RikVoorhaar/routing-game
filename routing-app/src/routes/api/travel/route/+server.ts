import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, gameStates } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { getShortestPath } from '$lib/routes/routing';
import { applyMaxSpeed } from '$lib/routes/route-utils';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
import type { Coordinate } from '$lib/server/db/schema';

// GET /api/travel/route?fromLat=X&fromLon=Y&toLat=X&toLon=Y&employeeId=X
// Returns preview route for travel (not gzipped - small response)
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const fromLat = parseFloat(url.searchParams.get('fromLat') || '');
	const fromLon = parseFloat(url.searchParams.get('fromLon') || '');
	const toLat = parseFloat(url.searchParams.get('toLat') || '');
	const toLon = parseFloat(url.searchParams.get('toLon') || '');
	const employeeId = url.searchParams.get('employeeId');

	if (isNaN(fromLat) || isNaN(fromLon) || isNaN(toLat) || isNaN(toLon)) {
		return error(400, 'Invalid coordinates');
	}

	if (!employeeId) {
		return error(400, 'Employee ID is required');
	}

	try {
		serverLog.api.info({ employeeId, fromLat, fromLon, toLat, toLon }, 'Fetching travel route');

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

		// Compute the route using getShortestPath
		const from: Coordinate = { lat: fromLat, lon: fromLon };
		const to: Coordinate = { lat: toLat, lon: toLon };

		serverLog.api.info({ employeeId, from, to }, 'Computing travel route');
		const routeResult = await getShortestPath(from, to);

		// Apply speed multiplier and max speed (same logic as active jobs)
		const employeeMaxSpeed = getEmployeeMaxSpeed(employee);
		const speedMultiplier = config.dev.speedMultiplier; // TODO: add employee/gameState multipliers
		const modifiedRoute = applyMaxSpeed(routeResult, employeeMaxSpeed, speedMultiplier);

		serverLog.api.info(
			{
				employeeId,
				pathLength: modifiedRoute.path.length,
				travelTimeSeconds: modifiedRoute.travelTimeSeconds,
				totalDistanceMeters: modifiedRoute.totalDistanceMeters,
				speedMultiplier
			},
			'Travel route computed successfully'
		);

		// Return JSON (not gzipped - small preview response)
		return new Response(
			JSON.stringify({
				success: true,
				path: modifiedRoute.path,
				travelTimeSeconds: modifiedRoute.travelTimeSeconds,
				totalDistanceMeters: modifiedRoute.totalDistanceMeters
			}),
			{
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				employeeId,
				fromLat,
				fromLon,
				toLat,
				toLon,
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error computing travel route'
		);

		// Check if it's a routing error (no route found)
		if (errorMessage.includes('Failed to get shortest path') || errorMessage.includes('no route')) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'No route found to destination'
				}),
				{
					status: 200, // Return 200 with success: false for client to handle
					headers: {
						'Content-Type': 'application/json'
					}
				}
			);
		}

		return error(500, `Failed to compute travel route: ${errorMessage}`);
	}
};
