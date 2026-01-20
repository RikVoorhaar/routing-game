import { getPlaces, setPlaces, type Place } from '$lib/stores/placesCache';
import { markTileLoaded } from '$lib/stores/placesTileAvailability';
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
 * Load places for visible tiles
 * @param visibleTiles Array of tile strings in format "z/x/y"
 * @param zoom Current zoom level
 * @param map Leaflet map instance (for logging/debugging)
 */
export async function loadPlacesForTiles(
	visibleTiles: string[],
	zoom: number,
	map: any
): Promise<void> {
	log.debug(`[PlacesLoader] Tile change detected: zoom=${zoom}, visibleTiles=${visibleTiles.length}`);

	// If zoom < 8, do nothing
	if (zoom < 8) {
		log.debug(`[PlacesLoader] Zoom level ${zoom} < 8, skipping places loading`);
		return;
	}

	// Parse visible tiles and compute parent tiles at zoom 8
	const parentTilesSet = new Set<string>();
	const parentTilesData: Map<string, { x: number; y: number }> = new Map();

	log.debug(`[PlacesLoader] Computing parent tiles at zoom 8 from ${visibleTiles.length} visible tiles`);

	for (const tileStr of visibleTiles) {
		const tile = parseTile(tileStr);
		if (!tile) {
			log.warn(`[PlacesLoader] Invalid tile format: ${tileStr}`);
			continue;
		}

		const parentTile = computeParentTile8(tile.z, tile.x, tile.y);
		if (!parentTile) {
			log.warn(`[PlacesLoader] Could not compute parent tile for ${tileStr}`);
			continue;
		}

		const parentTileKey = `8/${parentTile.x}/${parentTile.y}`;
		parentTilesSet.add(parentTileKey);
		parentTilesData.set(parentTileKey, parentTile);
	}

	log.debug(
		`[PlacesLoader] Computed ${parentTilesSet.size} unique parent tiles at zoom 8:`,
		Array.from(parentTilesSet)
	);

	// Load places for each parent tile
	const loadPromises = Array.from(parentTilesSet).map(async (tileKey) => {
		const tileData = parentTilesData.get(tileKey);
		if (!tileData) {
			return;
		}

		const { x: tileX, y: tileY } = tileData;

		try {
			// Check IndexedDB cache first
			log.debug(`[PlacesLoader] Checking cache for tile ${tileKey}`);
			let places = await getPlaces(tileX, tileY);

			if (places === null) {
				// Cache miss - fetch from API
				log.debug(`[PlacesLoader] Cache miss for tile ${tileKey}, fetching from API`);
				const response = await fetch(`/api/places/${tileX}/${tileY}`);

				if (!response.ok) {
					log.error(
						`[PlacesLoader] Failed to fetch places for tile ${tileKey}: ${response.status} ${response.statusText}`
					);
					return;
				}

				// Browser automatically decompresses gzip when Content-Encoding: gzip is set
				places = (await response.json()) as Place[];

				log.debug(
					`[PlacesLoader] Fetched ${places.length} places from API for tile ${tileKey}`
				);

				// Store in IndexedDB cache
				await setPlaces(tileX, tileY, places);
				log.debug(`[PlacesLoader] Stored ${places.length} places in cache for tile ${tileKey}`);
				
				// Mark tile as loaded in availability store
				markTileLoaded(tileX, tileY);
			} else {
				log.debug(
					`[PlacesLoader] Cache hit for tile ${tileKey}, found ${places.length} places`
				);
				
				// Mark tile as loaded even if it was already cached
				markTileLoaded(tileX, tileY);
			}

			// Log data counts
			log.debug(
				`[PlacesLoader] Tile ${tileKey} loaded: ${places.length} places`,
				places.length > 0
					? {
							categories: [...new Set(places.map((p) => p.category))],
							placesCount: places.length
						}
					: {}
			);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			log.error(
				`[PlacesLoader] Error loading places for tile ${tileKey}: ${errorMessage}`,
				errorStack ? { stack: errorStack } : error
			);
		}
	});

	// Wait for all tiles to load
	await Promise.all(loadPromises);
	log.debug(`[PlacesLoader] Finished loading places for ${parentTilesSet.size} tiles`);
}
