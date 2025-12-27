import { writable, get } from 'svelte/store';
import type { GameConfig } from '$lib/config/types';

/**
 * Client-side config store
 * Loads the config from the server on initialization
 * Note: Vehicle and upgrade definitions are imported directly from TypeScript code,
 * not loaded from the config store
 */

const configStore = writable<GameConfig | null>(null);
let isLoading = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load config from the server
 */
async function loadConfig(): Promise<void> {
	if (isLoading && loadPromise) {
		return loadPromise;
	}

	isLoading = true;
	loadPromise = (async () => {
		try {
			const response = await fetch('/api/config');
			if (!response.ok) {
				throw new Error(`Failed to load config: ${response.statusText}`);
			}
			const config: GameConfig = await response.json();
			configStore.set(config);
		} catch (error) {
			console.error('Failed to load game config:', error);
			// Set to null so components know config failed to load
			configStore.set(null);
		} finally {
			isLoading = false;
			loadPromise = null;
		}
	})();

	return loadPromise;
}

/**
 * Get the config store
 * Automatically loads config on first access if not already loaded
 */
export const config = {
	subscribe: configStore.subscribe,

	/**
	 * Load config from server (idempotent - won't reload if already loaded)
	 */
	async load(): Promise<void> {
		const current = get(configStore);
		if (current !== null) {
			return; // Already loaded
		}
		return loadConfig();
	},

	/**
	 * Reload config from server (forces reload even if already loaded)
	 */
	async reload(): Promise<void> {
		isLoading = false;
		loadPromise = null;
		return loadConfig();
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
			const serverConfig = await import('$lib/server/config');
			configStore.set(serverConfig.config);
		} catch (error) {
			console.error('Failed to load server config:', error);
		}
	})();
} else {
	// Client-side: load from API
	loadConfig();
}
