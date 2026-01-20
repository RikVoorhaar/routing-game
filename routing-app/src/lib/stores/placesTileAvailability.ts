import { writable } from 'svelte/store';
import { log } from '$lib/logger';

/**
 * Store tracking which tiles still need places data to be loaded
 * Tiles are stored as strings in format "8/x/y" (zoom 8 tile coordinates)
 */
export const tilesNeedingData = writable<Set<string>>(new Set());

/**
 * Mark a tile as having data loaded (remove from set of tiles needing data)
 * @param tileX Tile X coordinate at zoom level 8
 * @param tileY Tile Y coordinate at zoom level 8
 */
export function markTileLoaded(tileX: number, tileY: number): void {
	const tileKey = `8/${tileX}/${tileY}`;
	tilesNeedingData.update((set) => {
		const newSet = new Set(set);
		if (newSet.has(tileKey)) {
			newSet.delete(tileKey);
			log.debug(`[PlacesTileAvailability] Marked tile ${tileKey} as loaded`);
		}
		return newSet;
	});
}

/**
 * Initialize the store with a set of tiles that need data
 * @param tiles Array of tile coordinates that need data
 */
export function initializeTilesNeedingData(tiles: Array<{ tileX: number; tileY: number }>): void {
	const tileKeys = new Set(tiles.map((t) => `8/${t.tileX}/${t.tileY}`));
	tilesNeedingData.set(tileKeys);
	log.debug(
		`[PlacesTileAvailability] Initialized with ${tileKeys.size} tiles needing data`
	);
}

/**
 * Check if a tile still needs data
 * @param tileX Tile X coordinate at zoom level 8
 * @param tileY Tile Y coordinate at zoom level 8
 * @returns true if tile needs data, false otherwise
 */
export function tileNeedsData(tileX: number, tileY: number): boolean {
	let needsData = false;
	const tileKey = `8/${tileX}/${tileY}`;
	tilesNeedingData.subscribe((set) => {
		needsData = set.has(tileKey);
	})();
	return needsData;
}
