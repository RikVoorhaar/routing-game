import { handle as authHandle } from './auth';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import {
	runWithContext,
	updateRequestContext,
	type RequestContext
} from './lib/server/logging/requestContext';
import { log } from './lib/logger';

export const handle: Handle = async ({ event, resolve }) => {
	// Handle Chrome DevTools requests silently - just return 404 without logging
	if (event.url.pathname.startsWith('/.well-known/appspecific/com.chrome.devtools.json')) {
		return new Response('', { status: 404 });
	}

	// Generate request ID
	const requestId = nanoid();
	const startTime = Date.now();

	// Get user ID from session if available
	let userId: string | undefined;
	try {
		const session = await event.locals.auth();
		userId = session?.user?.id;
	} catch {
		// Session might not be available yet, that's OK
	}

	// Extract IDs from URL params if present
	const gameStateId = event.params?.gameStateId;
	const employeeId = event.params?.employeeId;
	const routeId = event.params?.routeId;
	const jobId = event.params?.jobId || event.params?.activeJobId;

	// Create request context
	const context: RequestContext = {
		requestId,
		userId,
		gameStateId,
		employeeId,
		jobId
	};

	// Run request with context
	return runWithContext(context, async () => {
		// Determine if this request should be logged at info level
		// Skip noisy endpoints: tile-loading requests, polling endpoints
		const path = event.url.pathname;
		const method = event.request.method;
		const isNoisyEndpoint =
			(path === '/api/active-jobs' && method === 'GET') || // Polling requests
			path === '/api/config' || // Config requests
			path.startsWith('/_app/') || // SvelteKit internal
			path.startsWith('/favicon.ico');

		// Log important requests at info, others at debug
		// Important: POST/PUT/DELETE, or any non-GET, or errors
		const shouldLogAtInfo = !isNoisyEndpoint && method !== 'GET';

		if (shouldLogAtInfo) {
			log.info(
				{
					event: 'request.start',
					method,
					path,
					query: Object.fromEntries(event.url.searchParams)
				},
				`[${method}] ${path}`
			);
		} else {
			log.debug(
				{
					event: 'request.start',
					method,
					path,
					query: Object.fromEntries(event.url.searchParams)
				},
				`[${method}] ${path}`
			);
		}

		let response: Response;
		let status = 500;

		try {
			response = await authHandle({ event, resolve });
			status = response.status;
			return response;
		} catch (error) {
			// Always log errors
			if (!(error instanceof Error) || !error.message?.includes('chrome.devtools')) {
				log.error(
					{
						event: 'request.error',
						method,
						path,
						err:
							error instanceof Error
								? {
										name: error.name,
										message: error.message,
										stack: error.stack
									}
								: error
					},
					'Request error'
				);
			}
			throw error;
		} finally {
			// Log request completion - info for important requests, debug for noisy ones
			const duration = Date.now() - startTime;
			const isSlowRequest = duration > 1000; // Log slow requests at info even if GET
			const isError = status >= 400;
			const shouldLogCompleteAtInfo = shouldLogAtInfo || isSlowRequest || isError;

			if (shouldLogCompleteAtInfo) {
				log.info(
					{
						event: 'request.complete',
						method,
						path,
						status,
						duration_ms: duration
					},
					`[${method}] ${path} ${status} (${duration}ms)`
				);
			} else {
				log.debug(
					{
						event: 'request.complete',
						method,
						path,
						status,
						duration_ms: duration
					},
					`[${method}] ${path} ${status} (${duration}ms)`
				);
			}
		}
	});
};

export const handleError: HandleServerError = ({ error, event }) => {
	const requestId = event.locals?.requestId || 'unknown';

	log.error(
		{
			event: 'server.error',
			request_id: requestId,
			path: event.url.pathname,
			method: event.request.method,
			err:
				error instanceof Error
					? {
							name: error.name,
							message: error.message,
							stack: error.stack
						}
					: error
		},
		'Unhandled server error'
	);

	// Return a user-friendly error response
	return {
		message: error instanceof Error ? error.message : 'An unexpected error occurred'
	};
};
