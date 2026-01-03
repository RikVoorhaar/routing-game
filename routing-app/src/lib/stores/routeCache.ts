import { writable } from 'svelte/store';
import type { RoutingResult } from '$lib/server/db/schema';
import { log } from '$lib/logger';

// Cache for active route data keyed by activeJobId
const routeCache = new Map<string, RoutingResult>();

// Store to track loading states
export const routeLoadingStates = writable<Record<string, boolean>>({});

/**
 * Fetch route data for an active job from the API
 */
async function fetchRoute(activeJobId: string): Promise<RoutingResult | null> {
	try {
		// Update loading state
		routeLoadingStates.update((states) => ({ ...states, [activeJobId]: true }));

		const response = await fetch(`/api/active-routes/${activeJobId}`);

		if (!response.ok) {
			if (response.status === 404) {
				log.warn(`[RouteCache] Route not found for activeJobId: ${activeJobId}`);
				return null;
			}
			throw new Error(`Failed to fetch route: ${response.statusText}`);
		}

		// Browser automatically decompresses gzip when Content-Encoding: gzip is set
		const routeData: RoutingResult = await response.json();

		// Cache the route data
		routeCache.set(activeJobId, routeData);

		return routeData;
	} catch (error) {
		log.error(`[RouteCache] Error fetching route for activeJobId ${activeJobId}:`, error);
		return null;
	} finally {
		// Update loading state
		routeLoadingStates.update((states) => {
			const newStates = { ...states };
			delete newStates[activeJobId];
			return newStates;
		});
	}
}

/**
 * Get route data for an active job, fetching if not cached
 */
export async function getRoute(activeJobId: string): Promise<RoutingResult | null> {
	// Check cache first
	if (routeCache.has(activeJobId)) {
		return routeCache.get(activeJobId)!;
	}

	// Fetch if not cached
	return await fetchRoute(activeJobId);
}

/**
 * Prefetch route data for multiple active jobs
 */
export async function prefetchRoutes(activeJobIds: string[]): Promise<void> {
	const uncachedIds = activeJobIds.filter((id) => !routeCache.has(id));
	if (uncachedIds.length === 0) {
		return;
	}

	// Fetch all uncached routes in parallel
	await Promise.all(uncachedIds.map((id) => fetchRoute(id)));
}

/**
 * Clear the route cache
 */
export function clearRouteCache(): void {
	routeCache.clear();
}

/**
 * Remove a specific route from cache
 */
export function removeRouteFromCache(activeJobId: string): void {
	routeCache.delete(activeJobId);
}

