import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { activeRoutes, activeJobs, gameStates } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';

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
			serverLog.api.warn({ activeJobId, gameStateId: activeJob.gameStateId }, 'Game state not found');
			return error(404, 'Game state not found');
		}

		// Verify the game state belongs to the current user
		if (gameState.userId !== session.user.id) {
			serverLog.api.warn({ activeJobId, userId: session.user.id, gameStateUserId: gameState.userId }, 'Access denied');
			return error(403, 'Access denied');
		}

		// Get the active route with gzipped data
		const activeRoute = await db.query.activeRoutes.findFirst({
			where: eq(activeRoutes.activeJobId, activeJobId)
		});

		if (!activeRoute) {
			serverLog.api.error({ activeJobId }, 'Active route not found in database');
			return error(404, 'Active route not found');
		}

		// Check if routeDataGzip exists
		if (!activeRoute.routeDataGzip) {
			serverLog.api.error({ 
				activeJobId, 
				routeId: activeRoute.id,
				routeDataGzip: activeRoute.routeDataGzip
			}, 'routeDataGzip is null or undefined');
			return error(500, 'Route data is missing');
		}

		serverLog.api.info({ 
			activeJobId, 
			routeId: activeRoute.id,
			routeDataType: typeof activeRoute.routeDataGzip,
			isBuffer: Buffer.isBuffer(activeRoute.routeDataGzip),
			isUint8Array: activeRoute.routeDataGzip instanceof Uint8Array,
			hasValue: !!activeRoute.routeDataGzip,
			valueLength: Buffer.isBuffer(activeRoute.routeDataGzip) 
				? activeRoute.routeDataGzip.length 
				: (activeRoute.routeDataGzip instanceof Uint8Array 
					? activeRoute.routeDataGzip.length 
					: String(activeRoute.routeDataGzip).length)
		}, 'Route data retrieved from database');

		// Convert Buffer to ArrayBuffer for Response constructor
		// The routeDataGzip is stored as bytea (Buffer) in the database
		let routeDataBuffer: Buffer;
		try {
			if (Buffer.isBuffer(activeRoute.routeDataGzip)) {
				routeDataBuffer = activeRoute.routeDataGzip;
			} else if (activeRoute.routeDataGzip instanceof Uint8Array) {
				routeDataBuffer = Buffer.from(activeRoute.routeDataGzip);
			} else if (typeof activeRoute.routeDataGzip === 'string') {
				// Handle case where it might be returned as a hex string or base64
				routeDataBuffer = Buffer.from(activeRoute.routeDataGzip, 'binary');
			} else {
				// Fallback: try to convert to Buffer
				serverLog.api.error({ 
					activeJobId,
					type: typeof activeRoute.routeDataGzip,
					value: activeRoute.routeDataGzip
				}, 'Unexpected routeDataGzip type');
				routeDataBuffer = Buffer.from(activeRoute.routeDataGzip as any);
			}
		} catch (conversionErr) {
			serverLog.api.error({ 
				activeJobId,
				error: conversionErr instanceof Error ? conversionErr.message : String(conversionErr),
				stack: conversionErr instanceof Error ? conversionErr.stack : undefined
			}, 'Error converting route data to Buffer');
			return error(500, `Failed to convert route data: ${conversionErr instanceof Error ? conversionErr.message : String(conversionErr)}`);
		}

		if (!routeDataBuffer || routeDataBuffer.length === 0) {
			serverLog.api.error({ activeJobId, bufferLength: routeDataBuffer?.length }, 'Empty route data buffer');
			return error(500, 'Route data is empty');
		}

		serverLog.api.debug({ activeJobId, bufferLength: routeDataBuffer.length }, 'Route data buffer created successfully');

		// In Node.js 18+, Response constructor accepts Buffer directly
		// But we'll convert to Uint8Array for maximum compatibility
		// Create a new Uint8Array view of the buffer
		const uint8Array = new Uint8Array(
			routeDataBuffer.buffer,
			routeDataBuffer.byteOffset,
			routeDataBuffer.byteLength
		);

		serverLog.api.info({ activeJobId, dataLength: uint8Array.length }, 'Returning route data');

		// Return the gzipped route data with appropriate headers
		// The browser will automatically decompress it when Content-Encoding: gzip is set
		return new Response(uint8Array, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Encoding': 'gzip'
			}
		});
	} catch (err) {
		serverLog.api.error({ 
			activeJobId,
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined
		}, 'Error fetching active route');
		return error(500, `Failed to fetch active route: ${err instanceof Error ? err.message : String(err)}`);
	}
};
