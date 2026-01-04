import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { activeJobs, gameStates, jobs, employees, addresses } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { computeActiveRouteForActiveJob } from '$lib/server/routes/activeRouteCompute';
import { getRoute, setRoute } from '$lib/server/routeCache/activeRouteCache';

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
		serverLog.api.info({ activeJobId }, 'Fetching active route');

		// Get the active job
		const activeJob = await db.query.activeJobs.findFirst({
			where: eq(activeJobs.id, activeJobId)
		});

		if (!activeJob) {
			serverLog.api.warn({ activeJobId }, 'Active job not found');
			return error(404, 'Active job not found');
		}

		// Get the game state to verify ownership
		const gameState = await db.query.gameStates.findFirst({
			where: eq(gameStates.id, activeJob.gameStateId)
		});

		if (!gameState) {
			serverLog.api.warn(
				{ activeJobId, gameStateId: activeJob.gameStateId },
				'Game state not found'
			);
			return error(404, 'Game state not found');
		}

		// Verify the game state belongs to the current user
		if (gameState.userId !== session.user.id) {
			serverLog.api.warn(
				{ activeJobId, userId: session.user.id, gameStateUserId: gameState.userId },
				'Access denied'
			);
			return error(403, 'Access denied');
		}

		// Check Redis cache first
		let routeDataGzip = await getRoute(activeJobId);

		// If route doesn't exist in cache, compute it on-demand
		if (!routeDataGzip) {
			serverLog.api.info({ activeJobId }, 'Route not found in cache, computing on-demand');

			// Fetch job and employee data needed for route computation
			const [job, employee] = await Promise.all([
				db.query.jobs.findFirst({
					where: eq(jobs.id, activeJob.jobId)
				}),
				db.query.employees.findFirst({
					where: eq(employees.id, activeJob.employeeId)
				})
			]);

			if (!job) {
				serverLog.api.error({ activeJobId, jobId: activeJob.jobId }, 'Job not found');
				return error(404, 'Job not found');
			}

			if (!employee) {
				serverLog.api.error(
					{ activeJobId, employeeId: activeJob.employeeId },
					'Employee not found'
				);
				return error(404, 'Employee not found');
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

			// Compute the route using the helper function
			serverLog.api.info({ activeJobId }, 'Computing route');
			const { routeDataGzip: computedRouteData, durationSeconds } =
				await computeActiveRouteForActiveJob(
					activeJobId,
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

			// Store the computed route in Redis with 24h TTL
			const ttlSeconds = 24 * 3600; // 24 hours
			await setRoute(activeJobId, computedRouteData, ttlSeconds);

			// Update the active job with the real duration in Postgres
			await db.update(activeJobs).set({ durationSeconds }).where(eq(activeJobs.id, activeJobId));

			serverLog.api.info({ activeJobId, durationSeconds }, 'Route computed and stored in Redis');

			routeDataGzip = computedRouteData;
		} else {
			serverLog.api.info(
				{ activeJobId, dataLength: routeDataGzip.length },
				'Route retrieved from Redis cache'
			);
		}

		if (!routeDataGzip || routeDataGzip.length === 0) {
			serverLog.api.error(
				{ activeJobId, bufferLength: routeDataGzip?.length },
				'Empty route data buffer'
			);
			return error(500, 'Route data is empty');
		}

		serverLog.api.info({ activeJobId, dataLength: routeDataGzip.length }, 'Returning route data');

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
				activeJobId,
				error: err instanceof Error ? err.message : String(err),
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error fetching active route'
		);
		return error(
			500,
			`Failed to fetch active route: ${err instanceof Error ? err.message : String(err)}`
		);
	}
};
