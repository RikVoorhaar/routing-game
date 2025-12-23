import { writable } from 'svelte/store';

export const selectedRoute = writable<string | null>(null);

export function selectRoute(routeId: string | null) {
	selectedRoute.set(routeId);
}

export function clearSelection() {
	selectedRoute.set(null);
}
