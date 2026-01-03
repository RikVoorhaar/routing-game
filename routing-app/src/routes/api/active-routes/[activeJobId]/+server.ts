import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { activeRoutes, activeJobs, gameStates } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

// GET /api/active-routes/[activeJobId] - Get gzipped route data for an active job
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	const activeJobId = params.activeJobId;

	if (!activeJobId) {
		return error(400, 'Active job ID is required');
	}

	try {
		// Get the active job and verify ownership via game state
		const activeJob = await db.query.activeJobs.findFirst({
			where: eq(activeJobs.id, activeJobId),
			with: {
				gameState: true
			}
		});

		if (!activeJob) {
			return error(404, 'Active job not found');
		}

		// Verify the game state belongs to the current user
		if (activeJob.gameState.userId !== session.user.id) {
			return error(403, 'Access denied');
		}

		// Get the active route with gzipped data
		const activeRoute = await db.query.activeRoutes.findFirst({
			where: eq(activeRoutes.activeJobId, activeJobId)
		});

		if (!activeRoute) {
			return error(404, 'Active route not found');
		}

		// Return the gzipped route data with appropriate headers
		// The browser will automatically decompress it when Content-Encoding: gzip is set
		return new Response(activeRoute.routeDataGzip, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Encoding': 'gzip'
			}
		});
	} catch (err) {
		console.error('Error fetching active route:', err);
		return error(500, 'Failed to fetch active route');
	}
};
