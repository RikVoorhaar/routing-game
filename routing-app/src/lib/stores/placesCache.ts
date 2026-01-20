import { log } from '$lib/logger';

/**
 * Place data structure matching API response
 */
export interface Place {
	id: number;
	category: string;
	lat: number;
	lon: number;
	region: string | null;
}

const DB_NAME = 'placesCache';
const DB_VERSION = 1;
const STORE_NAME = 'places';

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize or open the IndexedDB database
 */
export async function initPlacesDB(): Promise<IDBDatabase> {
	if (dbInstance) {
		return dbInstance;
	}

	if (initPromise) {
		return initPromise;
	}

	initPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => {
			const error = request.error;
			log.error('[PlacesCache] Failed to open IndexedDB:', error);
			initPromise = null;
			reject(error);
		};

		request.onsuccess = () => {
			dbInstance = request.result;
			log.debug('[PlacesCache] IndexedDB opened successfully');
			initPromise = null;
			resolve(dbInstance);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			
			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'tileKey' });
				log.debug('[PlacesCache] Created object store:', STORE_NAME);
			}
		};
	});

	return initPromise;
}

/**
 * Get places from IndexedDB cache
 * @param tileX Tile X coordinate at zoom level 8
 * @param tileY Tile Y coordinate at zoom level 8
 * @returns Array of places or null if not found
 */
export async function getPlaces(tileX: number, tileY: number): Promise<Place[] | null> {
	try {
		const db = await initPlacesDB();
		const tileKey = `8/${tileX}/${tileY}`;

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(tileKey);

			request.onerror = () => {
				log.error('[PlacesCache] Error reading from IndexedDB:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				const result = request.result;
				if (result && result.places) {
					log.debug(`[PlacesCache] Cache hit for tile ${tileKey}, found ${result.places.length} places`);
					resolve(result.places);
				} else {
					log.debug(`[PlacesCache] Cache miss for tile ${tileKey}`);
					resolve(null);
				}
			};
		});
	} catch (error) {
		log.error('[PlacesCache] Error getting places from cache:', error);
		return null;
	}
}

/**
 * Store places in IndexedDB cache
 * @param tileX Tile X coordinate at zoom level 8
 * @param tileY Tile Y coordinate at zoom level 8
 * @param places Array of places to store
 */
export async function setPlaces(tileX: number, tileY: number, places: Place[]): Promise<void> {
	try {
		const db = await initPlacesDB();
		const tileKey = `8/${tileX}/${tileY}`;

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put({ tileKey, places });

			request.onerror = () => {
				log.error('[PlacesCache] Error writing to IndexedDB:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				log.debug(`[PlacesCache] Stored ${places.length} places for tile ${tileKey} in IndexedDB`);
				resolve();
			};
		});
	} catch (error) {
		log.error('[PlacesCache] Error setting places in cache:', error);
		throw error;
	}
}
