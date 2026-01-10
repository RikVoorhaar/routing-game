import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { travelJobs, gameStates, employees } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { deleteRoute } from '$lib/server/routeCache/travelRouteCache';

// POST /api/travel/complete - Complete a travel job and update employee location
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { travelJobId, employeeId } = await request.json();

		if (!travelJobId || !employeeId) {
			return error(400, 'Travel job ID and employee ID are required');
		}

		// Get the travel job
		const travelJob = await db.query.travelJobs.findFirst({
			where: eq(travelJobs.id, travelJobId)
		});

		if (!travelJob) {
			return error(404, 'Travel job not found');
		}

		// Verify the travel job belongs to the employee
		if (travelJob.employeeId !== employeeId) {
			return error(400, 'Travel job does not belong to this employee');
		}

		// Get the game state to verify ownership
		const gameState = await db.query.gameStates.findFirst({
			where: eq(gameStates.id, travelJob.gameStateId)
		});

		if (!gameState) {
			return error(404, 'Game state not found');
		}

		if (gameState.userId !== session.user.id) {
			return error(403, 'Access denied');
		}

		// Update employee location to destination
		await db.transaction(async (tx) => {
			// Update employee location
			await tx
				.update(employees)
				.set({
					location: travelJob.destinationLocation
				})
				.where(eq(employees.id, employeeId));

			// Delete travel job record
			await tx.delete(travelJobs).where(eq(travelJobs.id, travelJobId));
		});

		// Clear Redis cache
		await deleteRoute(travelJobId);

		serverLog.api.info({ travelJobId, employeeId }, 'Travel job completed');

		return json({ success: true });
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error completing travel job'
		);
		return error(500, `Failed to complete travel: ${errorMessage}`);
	}
};
