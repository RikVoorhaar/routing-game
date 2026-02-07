import { log } from '$lib/logger';
import type { FeatureCollection } from 'geojson';

/**
 * Regions cache entry structure
 */
export interface RegionsCacheEntry {
	key: string;
	geojson: FeatureCollection;
	cachedAt: number; // Timestamp
}

const DB_NAME = 'regionsCache';
const DB_VERSION = 1;
const STORE_NAME = 'regions';
const CACHE_KEY = 'regions-geojson';

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize or open the IndexedDB database
 */
export async function initRegionsDB(): Promise<IDBDatabase> {
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
			log.error('[RegionsCache] Failed to open IndexedDB:', error);
			initPromise = null;
			reject(error);
		};

		request.onsuccess = () => {
			dbInstance = request.result;
			log.info('[RegionsCache] IndexedDB opened successfully');
			initPromise = null;
			resolve(dbInstance);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
				log.info('[RegionsCache] Created object store:', STORE_NAME);
			}
		};
	});

	return initPromise;
}

/**
 * Get regions GeoJSON from IndexedDB cache
 * @returns Cached GeoJSON FeatureCollection or null if not found
 */
export async function getRegionsGeoJson(): Promise<FeatureCollection | null> {
	try {
		const db = await initRegionsDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(CACHE_KEY);

			request.onerror = () => {
				log.error('[RegionsCache] Error reading from IndexedDB:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				const result = request.result as RegionsCacheEntry | undefined;
				if (result) {
					log.info('[RegionsCache] Cache hit for regions GeoJSON');
					resolve(result.geojson);
				} else {
					log.info('[RegionsCache] Cache miss for regions GeoJSON');
					resolve(null);
				}
			};
		});
	} catch (error) {
		log.error('[RegionsCache] Error getting regions from cache:', error);
		return null;
	}
}

/**
 * Store regions GeoJSON in IndexedDB cache
 * @param geojson - GeoJSON FeatureCollection to cache
 */
export async function setRegionsGeoJson(geojson: FeatureCollection): Promise<void> {
	try {
		const db = await initRegionsDB();

		const entry: RegionsCacheEntry = {
			key: CACHE_KEY,
			geojson,
			cachedAt: Date.now()
		};

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put(entry);

			request.onerror = () => {
				log.error('[RegionsCache] Error writing to IndexedDB:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				log.info('[RegionsCache] Stored regions GeoJSON in IndexedDB');
				resolve();
			};
		});
	} catch (error) {
		log.error('[RegionsCache] Error setting regions in cache:', error);
		throw error;
	}
}
