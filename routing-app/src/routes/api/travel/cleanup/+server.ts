import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { travelJobs, gameStates, employees } from '$lib/server/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { deleteRoute } from '$lib/server/routeCache/travelRouteCache';

// POST /api/travel/cleanup - Clean up stuck or duplicate travel jobs for an employee
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { employeeId, gameStateId } = await request.json();

		if (!employeeId || !gameStateId) {
			return error(400, 'Employee ID and game state ID are required');
		}

		// Verify the game state belongs to the current user
		const gameState = await db.query.gameStates.findFirst({
			where: and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id))
		});

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get the employee and verify ownership
		const employee = await db.query.employees.findFirst({
			where: and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId))
		});

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Get all travel jobs for this employee
		const allTravelJobs = await db.query.travelJobs.findMany({
			where: and(
				eq(travelJobs.employeeId, employeeId),
				eq(travelJobs.gameStateId, gameStateId),
				isNotNull(travelJobs.startTime)
			),
			orderBy: (travelJobs, { desc }) => [desc(travelJobs.startTime)]
		});

		if (allTravelJobs.length === 0) {
			return json({ success: true, cleaned: 0, message: 'No travel jobs found' });
		}

		const currentTime = Date.now();
		const jobsToComplete: typeof allTravelJobs = [];
		const jobsToDelete: typeof allTravelJobs = [];

		// Categorize travel jobs
		for (const travelJob of allTravelJobs) {
			if (!travelJob.startTime) {
				// Job without start time - delete it
				jobsToDelete.push(travelJob);
				continue;
			}

			const startTime = new Date(travelJob.startTime).getTime();
			const durationMs = (travelJob.durationSeconds || 0) * 1000;
			const shouldBeComplete = currentTime >= startTime + durationMs;

			if (shouldBeComplete) {
				// Overdue job - complete it
				jobsToComplete.push(travelJob);
			}
		}

		// If there are multiple travel jobs, keep only the most recent one
		// Delete all others (they're duplicates or stuck)
		if (allTravelJobs.length > 1) {
			const mostRecent = allTravelJobs[0]; // Already sorted by startTime desc
			for (const travelJob of allTravelJobs.slice(1)) {
				if (!jobsToComplete.includes(travelJob)) {
					jobsToDelete.push(travelJob);
				}
			}
		}

		// Complete overdue jobs
		for (const travelJob of jobsToComplete) {
			try {
				await db.transaction(async (tx) => {
					// Update employee location to the destination of this travel job
					await tx
						.update(employees)
						.set({
							location: travelJob.destinationLocation
						})
						.where(eq(employees.id, employeeId));

					// Delete travel job record
					await tx.delete(travelJobs).where(eq(travelJobs.id, travelJob.id));
				});

				// Clear Redis cache
				await deleteRoute(travelJob.id);

				serverLog.api.info(
					{ travelJobId: travelJob.id, employeeId },
					'Cleaned up overdue travel job'
				);
			} catch (err) {
				serverLog.api.error(
					{
						travelJobId: travelJob.id,
						employeeId,
						error: err instanceof Error ? err.message : String(err)
					},
					'Error cleaning up travel job'
				);
			}
		}

		// Delete duplicate/stuck jobs
		for (const travelJob of jobsToDelete) {
			try {
				await db.transaction(async (tx) => {
					await tx.delete(travelJobs).where(eq(travelJobs.id, travelJob.id));
				});

				// Clear Redis cache
				await deleteRoute(travelJob.id);

				serverLog.api.info(
					{ travelJobId: travelJob.id, employeeId },
					'Deleted duplicate/stuck travel job'
				);
			} catch (err) {
				serverLog.api.error(
					{
						travelJobId: travelJob.id,
						employeeId,
						error: err instanceof Error ? err.message : String(err)
					},
					'Error deleting travel job'
				);
			}
		}

		const totalCleaned = jobsToComplete.length + jobsToDelete.length;

		serverLog.api.info(
			{ employeeId, completed: jobsToComplete.length, deleted: jobsToDelete.length },
			'Travel cleanup completed'
		);

		return json({
			success: true,
			cleaned: totalCleaned,
			completed: jobsToComplete.length,
			deleted: jobsToDelete.length,
			message: `Cleaned up ${totalCleaned} travel job(s)`
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error cleaning up travel jobs'
		);
		return error(500, `Failed to cleanup travel jobs: ${errorMessage}`);
	}
};
