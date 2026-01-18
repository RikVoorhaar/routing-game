import { getPlaces, type Place } from '$lib/stores/placesCache';
import { log } from '$lib/logger';

/**
 * Parse tile string format "z/x/y" into coordinates
 */
function parseTile(tileStr: string): { z: number; x: number; y: number } | null {
	const parts = tileStr.split('/');
	if (parts.length !== 3) {
		return null;
	}
	const z = parseInt(parts[0], 10);
	const x = parseInt(parts[1], 10);
	const y = parseInt(parts[2], 10);
	if (isNaN(z) || isNaN(x) || isNaN(y)) {
		return null;
	}
	return { z, x, y };
}

/**
 * Compute parent tile at zoom level 8 from a tile at any zoom level
 */
function computeParentTile8(z: number, x: number, y: number): { x: number; y: number } | null {
	if (z < 8) {
		// Can't compute parent tile if current zoom is less than 8
		return null;
	}
	if (z === 8) {
		return { x, y };
	}
	// Divide by 2^(z-8) to get zoom 8 coordinates
	const divisor = Math.pow(2, z - 8);
	return {
		x: Math.floor(x / divisor),
		y: Math.floor(y / divisor)
	};
}

/**
 * Get places for visible tiles from IndexedDB cache, grouped by visible tile
 *
 * Parameters
 * -----------
 * visibleTiles: string[]
 *     Array of tile strings in format "z/x/y"
 * zoom: number
 *     Current zoom level
 *
 * Returns
 * --------
 * Promise<Map<string, Place[]>>
 *     Map of visible tile keys to arrays of places for that tile
 */
export async function getPlacesForVisibleTilesGrouped(
	visibleTiles: string[],
	zoom: number
): Promise<Map<string, Place[]>> {
	const result = new Map<string, Place[]>();

	if (zoom < 8) {
		log.info(`[PlacesGetter] Zoom level ${zoom} < 8, returning empty map`);
		return result;
	}

	// Group visible tiles by their parent zoom 8 tile
	const parentTilesMap = new Map<string, string[]>(); // parent tile key -> visible tile keys
	const parentTilesData = new Map<string, { x: number; y: number }>(); // parent tile key -> coordinates

	for (const tileStr of visibleTiles) {
		const tile = parseTile(tileStr);
		if (!tile) {
			log.warn(`[PlacesGetter] Invalid tile format: ${tileStr}`);
			continue;
		}

		const parentTile = computeParentTile8(tile.z, tile.x, tile.y);
		if (!parentTile) {
			log.warn(`[PlacesGetter] Could not compute parent tile for ${tileStr}`);
			continue;
		}

		const parentTileKey = `8/${parentTile.x}/${parentTile.y}`;
		
		if (!parentTilesMap.has(parentTileKey)) {
			parentTilesMap.set(parentTileKey, []);
			parentTilesData.set(parentTileKey, parentTile);
		}
		parentTilesMap.get(parentTileKey)!.push(tileStr);
	}

	log.info(
		`[PlacesGetter] Computing places for ${visibleTiles.length} visible tiles across ${parentTilesMap.size} parent tiles at zoom 8`
	);

	// Load places from IndexedDB for each parent tile
	for (const [parentTileKey, visibleTileKeys] of parentTilesMap.entries()) {
		const tileData = parentTilesData.get(parentTileKey);
		if (!tileData) {
			continue;
		}

		const { x: tileX, y: tileY } = tileData;

		try {
			const places = await getPlaces(tileX, tileY);
			if (!places || places.length === 0) {
				// Initialize empty arrays for all visible tiles in this parent
				visibleTileKeys.forEach((visibleTileKey) => {
					result.set(visibleTileKey, []);
				});
				continue;
			}

			log.debug(
				`[PlacesGetter] Loaded ${places.length} places from parent tile ${parentTileKey} for ${visibleTileKeys.length} visible tiles`
			);

			// Distribute places to visible tiles
			// For each visible tile, filter places that belong to it
			visibleTileKeys.forEach((visibleTileKey) => {
				const visibleTile = parseTile(visibleTileKey);
				if (!visibleTile) {
					result.set(visibleTileKey, []);
					return;
				}

				// Filter places that are within this visible tile's bounds
				const tilePlaces = places.filter((place) => {
					// Convert lat/lon to tile coordinates at current zoom
					const n = Math.pow(2, visibleTile.z);
					const tileX = Math.floor(((place.lon + 180) / 360) * n);
					const tileY = Math.floor(
						((1 - Math.log(Math.tan((place.lat * Math.PI) / 180) + 1 / Math.cos((place.lat * Math.PI) / 180)) / Math.PI) /
							2) *
							n
					);

					return tileX === visibleTile.x && tileY === visibleTile.y;
				});

				result.set(visibleTileKey, tilePlaces);
			});
		} catch (error) {
			log.error(`[PlacesGetter] Error loading places for parent tile ${parentTileKey}:`, error);
			// Initialize empty arrays for all visible tiles in this parent
			visibleTileKeys.forEach((visibleTileKey) => {
				result.set(visibleTileKey, []);
			});
		}
	}

	const totalPlaces = Array.from(result.values()).reduce((sum, places) => sum + places.length, 0);
	log.info(
		`[PlacesGetter] Distributed ${totalPlaces} places across ${result.size} visible tiles`
	);

	return result;
}

/**
 * Get places for visible tiles from IndexedDB cache
 *
 * Parameters
 * -----------
 * visibleTiles: string[]
 *     Array of tile strings in format "z/x/y"
 * zoom: number
 *     Current zoom level
 *
 * Returns
 * --------
 * Promise<Place[]>
 *     Combined array of places from all visible parent tiles at zoom 8
 */
export async function getPlacesForVisibleTiles(
	visibleTiles: string[],
	zoom: number
): Promise<Place[]> {
	const grouped = await getPlacesForVisibleTilesGrouped(visibleTiles, zoom);
	return Array.from(grouped.values()).flat();
}
