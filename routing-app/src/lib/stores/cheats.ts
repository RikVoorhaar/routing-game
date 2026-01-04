import { writable, derived } from 'svelte/store';
import { currentUser } from './gameData';

interface CheatSettings {
	showTileDebug: boolean;
}

// Default cheat settings
const defaultSettings: CheatSettings = {
	showTileDebug: false
};

// Cheat settings store
export const cheatSettings = writable<CheatSettings>(defaultSettings);

// Derived store to check if cheats are enabled
export const cheatsEnabled = derived(currentUser, ($currentUser) => {
	return $currentUser?.cheatsEnabled || false;
});

// Store for active map tiles (for debug display)
export const activeTiles = writable<Set<string>>(new Set());

// Cheat actions
export const cheatActions = {
	// Toggle tile debug display
	toggleTileDebug() {
		cheatSettings.update((settings) => ({
			...settings,
			showTileDebug: !settings.showTileDebug
		}));
	},

	// Set tile debug state
	setTileDebug(enabled: boolean) {
		cheatSettings.update((settings) => ({
			...settings,
			showTileDebug: enabled
		}));
	},

	// Update active tiles
	setActiveTiles(tiles: Set<string>) {
		activeTiles.set(tiles);
	},

	// Add an active tile
	addActiveTile(tile: string) {
		activeTiles.update((tiles) => {
			const newTiles = new Set(tiles);
			newTiles.add(tile);
			return newTiles;
		});
	},

	// Remove an active tile
	removeActiveTile(tile: string) {
		activeTiles.update((tiles) => {
			const newTiles = new Set(tiles);
			newTiles.delete(tile);
			return newTiles;
		});
	},

	// Clear all active tiles
	clearActiveTiles() {
		activeTiles.set(new Set());
	},

	// Reset all cheat settings
	reset() {
		cheatSettings.set(defaultSettings);
		activeTiles.set(new Set());
	}
};
