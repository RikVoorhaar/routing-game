import { writable, get } from 'svelte/store';
import type { PlaceGoodsConfig } from '$lib/config/placeGoodsTypes';

/**
 * Client-side place goods config store
 * Loads the config from the server on initialization
 */

const placeGoodsStore = writable<PlaceGoodsConfig | null>(null);
let isLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load place goods config from the server
 */
async function loadPlaceGoods(): Promise<void> {
	if (isLoading && loadPromise) {
		return loadPromise;
	}

	isLoading = true;
	loadPromise = (async () => {
		try {
			const response = await fetch('/api/place-goods');
			if (!response.ok) {
				throw new Error(`Failed to load place goods config: ${response.statusText}`);
			}
			const config: PlaceGoodsConfig = await response.json();
			placeGoodsStore.set(config);
		} catch (error) {
			console.error('Failed to load place goods config:', error);
			// Set to null so components know config failed to load
			placeGoodsStore.set(null);
		} finally {
			isLoading = false;
			loadPromise = null;
		}
	})();

	return loadPromise;
}

/**
 * Get the place goods config store
 * Automatically loads config on first access if not already loaded
 */
export const placeGoods = {
	subscribe: placeGoodsStore.subscribe,

	/**
	 * Load place goods config from server (idempotent - won't reload if already loaded)
	 */
	async load(): Promise<void> {
		const current = get(placeGoodsStore);
		if (current !== null) {
			return; // Already loaded
		}
		return loadPlaceGoods();
	},

	/**
	 * Reload place goods config from server (forces reload even if already loaded)
	 */
	async reload(): Promise<void> {
		isLoading = false;
		loadPromise = null;
		return loadPlaceGoods();
	}
};

// Auto-load config when module is imported
// On server, populate with server config immediately
// On client, load from API
if (typeof window === 'undefined') {
	// Server-side: use server config directly
	// Use dynamic import for ES module compatibility
	(async () => {
		try {
			const serverPlaceGoods = await import('$lib/server/config/placeGoods');
			placeGoodsStore.set(serverPlaceGoods.placeGoodsConfig);
		} catch (error) {
			console.error('Failed to load server place goods config:', error);
		}
	})();
} else {
	// Client-side: load from API
	loadPlaceGoods();
}
