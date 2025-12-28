import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
	requestId: string;
	userId?: string;
	gameStateId?: string;
	employeeId?: string;
	jobId?: string;
	[key: string]: unknown;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function with request context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
	return requestContextStorage.run(context, fn);
}

/**
 * Get the current request context
 */
export function getRequestContext(): RequestContext | undefined {
	return requestContextStorage.getStore();
}

/**
 * Update the current request context with additional fields
 */
export function updateRequestContext(updates: Partial<RequestContext>): void {
	const current = getRequestContext();
	if (current) {
		Object.assign(current, updates);
	}
}
