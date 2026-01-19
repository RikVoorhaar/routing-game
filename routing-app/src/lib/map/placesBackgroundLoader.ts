import { getPlaces, setPlaces, type Place } from '$lib/stores/placesCache';
import { tilesNeedingData, markTileLoaded, initializeTilesNeedingData } from '$lib/stores/placesTileAvailability';
import { log } from '$lib/logger';

interface TileCoordinate {
	tileX: number;
	tileY: number;
}

let isProcessing = false;
let processingQueue: Array<{ tileX: number; tileY: number }> = [];
let processingTimeout: NodeJS.Timeout | null = null;

const PROCESSING_DELAY_MS = 10; // Delay between processing each tile
const INITIAL_DELAY_MS = 2000; // Delay before starting background processing

/**
 * Fetch list of all tiles with places data from API
 */
async function fetchAllTiles(): Promise<TileCoordinate[]> {
	try {
		log.info('[PlacesBackgroundLoader] Fetching list of all tiles with places data');
		const response = await fetch('/api/places/tiles');

		if (!response.ok) {
			log.error(
				`[PlacesBackgroundLoader] Failed to fetch tiles list: ${response.status} ${response.statusText}`
			);
			return [];
		}

		const tiles = (await response.json()) as TileCoordinate[];
		log.info(`[PlacesBackgroundLoader] Fetched ${tiles.length} tiles with places data`);
		return tiles;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error(`[PlacesBackgroundLoader] Error fetching tiles list: ${errorMessage}`);
		return [];
	}
}

/**
 * Check which tiles are already cached in IndexedDB
 */
async function filterCachedTiles(
	tiles: TileCoordinate[]
): Promise<Array<{ tileX: number; tileY: number }>> {
	const uncachedTiles: Array<{ tileX: number; tileY: number }> = [];

	log.info(`[PlacesBackgroundLoader] Checking IndexedDB cache for ${tiles.length} tiles`);

	for (const tile of tiles) {
		try {
			const cached = await getPlaces(tile.tileX, tile.tileY);
			if (cached === null) {
				uncachedTiles.push(tile);
			}
		} catch (error) {
			// If there's an error checking cache, assume tile needs loading
			log.warn(
				`[PlacesBackgroundLoader] Error checking cache for tile ${tile.tileX}/${tile.tileY}, will attempt to load`
			);
			uncachedTiles.push(tile);
		}
	}

	log.info(
		`[PlacesBackgroundLoader] Found ${uncachedTiles.length} uncached tiles out of ${tiles.length} total`
	);
	return uncachedTiles;
}

/**
 * Load a single tile's places data
 */
async function loadTile(tileX: number, tileY: number): Promise<boolean> {
	const tileKey = `8/${tileX}/${tileY}`;

	try {
		// Double-check IndexedDB (might have been loaded by UI in the meantime)
		const cached = await getPlaces(tileX, tileY);
		if (cached !== null) {
			log.debug(`[PlacesBackgroundLoader] Tile ${tileKey} already cached, skipping`);
			markTileLoaded(tileX, tileY);
			return true;
		}

		// Fetch from API
		log.debug(`[PlacesBackgroundLoader] Loading tile ${tileKey} from API`);
		const response = await fetch(`/api/places/${tileX}/${tileY}`);

		if (!response.ok) {
			log.error(
				`[PlacesBackgroundLoader] Failed to fetch tile ${tileKey}: ${response.status} ${response.statusText}`
			);
			return false;
		}

		// Browser automatically decompresses gzip when Content-Encoding: gzip is set
		const places = (await response.json()) as Place[];

		// Store in IndexedDB
		await setPlaces(tileX, tileY, places);
		log.debug(`[PlacesBackgroundLoader] Loaded and cached ${places.length} places for tile ${tileKey}`);

		// Mark as loaded in store
		markTileLoaded(tileX, tileY);

		return true;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		log.error(`[PlacesBackgroundLoader] Error loading tile ${tileKey}: ${errorMessage}`);
		return false;
	}
}

/**
 * Process the next tile in the queue
 */
async function processNextTile(): Promise<void> {
	if (processingQueue.length === 0) {
		isProcessing = false;
		log.info('[PlacesBackgroundLoader] Queue empty, background loading complete');
		return;
	}

	const tile = processingQueue.shift();
	if (!tile) {
		isProcessing = false;
		return;
	}

	await loadTile(tile.tileX, tile.tileY);

	// Schedule next tile processing
	if (processingQueue.length > 0) {
		processingTimeout = setTimeout(() => {
			processNextTile();
		}, PROCESSING_DELAY_MS);
	} else {
		isProcessing = false;
		log.info('[PlacesBackgroundLoader] Queue processing complete');
	}
}

/**
 * Start background prefetching of places data
 * This function:
 * 1. Fetches list of all tiles with data
 * 2. Filters out already-cached tiles
 * 3. Adds remaining tiles to queue
 * 4. Processes queue one-by-one in background
 */
export async function startBackgroundPrefetching(): Promise<void> {
	if (isProcessing) {
		log.info('[PlacesBackgroundLoader] Background prefetching already in progress');
		return;
	}

	log.info('[PlacesBackgroundLoader] Starting background prefetching');

	// Wait a bit before starting to avoid blocking initial page load
	setTimeout(async () => {
		try {
			// Fetch all tiles with data
			const allTiles = await fetchAllTiles();
			if (allTiles.length === 0) {
				log.warn('[PlacesBackgroundLoader] No tiles found, skipping prefetching');
				return;
			}

			// Initialize store with all tiles
			initializeTilesNeedingData(allTiles);

			// Filter out already-cached tiles
			const uncachedTiles = await filterCachedTiles(allTiles);

			if (uncachedTiles.length === 0) {
				log.info('[PlacesBackgroundLoader] All tiles already cached, nothing to prefetch');
				// Mark all tiles as loaded
				allTiles.forEach((tile) => markTileLoaded(tile.tileX, tile.tileY));
				return;
			}

			// Add uncached tiles to queue
			processingQueue = [...uncachedTiles];
			isProcessing = true;

			log.info(
				`[PlacesBackgroundLoader] Starting to process ${processingQueue.length} tiles in background`
			);

			// Start processing queue
			processNextTile();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error(`[PlacesBackgroundLoader] Error in background prefetching: ${errorMessage}`);
			isProcessing = false;
		}
	}, INITIAL_DELAY_MS);
}

/**
 * Stop background prefetching (useful for cleanup)
 */
export function stopBackgroundPrefetching(): void {
	if (processingTimeout) {
		clearTimeout(processingTimeout);
		processingTimeout = null;
	}
	isProcessing = false;
	processingQueue = [];
	log.info('[PlacesBackgroundLoader] Background prefetching stopped');
}
