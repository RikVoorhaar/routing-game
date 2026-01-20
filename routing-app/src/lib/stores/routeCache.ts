import { log } from '$lib/logger';
import type { PathPoint, Coordinate } from '$lib/server/db/schema';

/**
 * Route cache entry structure
 */
export interface RouteCacheEntry {
	routeKey: string;
	employeeId: string;
	startPlaceId: number;
	endPlaceId: number;
	path: PathPoint[];
	durationSeconds: number;
	totalDistanceMeters: number;
	startLocation: Coordinate;
	endLocation: Coordinate;
	computedAt: number; // Timestamp
}

const DB_NAME = 'routeCache';
const DB_VERSION = 1;
const STORE_NAME = 'routes';

let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

/**
 * Generate route cache key
 */
export function getRouteKey(employeeId: string, startPlaceId: number, endPlaceId: number): string {
	return `${employeeId}_${startPlaceId}_${endPlaceId}`;
}

/**
 * Initialize or open the IndexedDB database
 */
export async function initRouteDB(): Promise<IDBDatabase> {
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
			log.error('[RouteCache] Failed to open IndexedDB:', error);
			initPromise = null;
			reject(error);
		};

		request.onsuccess = () => {
			dbInstance = request.result;
			log.info('[RouteCache] IndexedDB opened successfully');
			initPromise = null;
			resolve(dbInstance);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			
			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'routeKey' });
				// Create index on employeeId for efficient eviction
				objectStore.createIndex('employeeId', 'employeeId', { unique: false });
				log.info('[RouteCache] Created object store:', STORE_NAME);
			}
		};
	});

	return initPromise;
}

/**
 * Get place-to-place route from IndexedDB cache
 * @param employeeId - Employee ID
 * @param startPlaceId - Start place ID
 * @param endPlaceId - End place ID
 * @returns Route cache entry or null if not found
 */
export async function getPlaceRoute(
	employeeId: string,
	startPlaceId: number,
	endPlaceId: number
): Promise<RouteCacheEntry | null> {
	try {
		const db = await initRouteDB();
		const routeKey = getRouteKey(employeeId, startPlaceId, endPlaceId);

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readonly');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(routeKey);

			request.onerror = () => {
				log.error('[RouteCache] Error reading from IndexedDB:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				const result = request.result;
				if (result) {
					log.info(`[RouteCache] Cache hit for route ${routeKey}`);
					resolve(result);
				} else {
					log.info(`[RouteCache] Cache miss for route ${routeKey}`);
					resolve(null);
				}
			};
		});
	} catch (error) {
		log.error('[RouteCache] Error getting route from cache:', error);
		return null;
	}
}

/**
 * Store place-to-place route in IndexedDB cache
 * @param employeeId - Employee ID
 * @param startPlaceId - Start place ID
 * @param endPlaceId - End place ID
 * @param path - Route path
 * @param durationSeconds - Route duration in seconds
 * @param totalDistanceMeters - Total distance in meters
 * @param startLocation - Start location coordinates
 * @param endLocation - End location coordinates
 */
export async function setPlaceRoute(
	employeeId: string,
	startPlaceId: number,
	endPlaceId: number,
	path: PathPoint[],
	durationSeconds: number,
	totalDistanceMeters: number,
	startLocation: Coordinate,
	endLocation: Coordinate
): Promise<void> {
	try {
		const db = await initRouteDB();
		const routeKey = getRouteKey(employeeId, startPlaceId, endPlaceId);

		const entry: RouteCacheEntry = {
			routeKey,
			employeeId,
			startPlaceId,
			endPlaceId,
			path,
			durationSeconds,
			totalDistanceMeters,
			startLocation,
			endLocation,
			computedAt: Date.now()
		};

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put(entry);

			request.onerror = () => {
				log.error('[RouteCache] Error writing to IndexedDB:', request.error);
				reject(request.error);
			};

			request.onsuccess = () => {
				log.info(`[RouteCache] Stored route ${routeKey} in IndexedDB`);
				resolve();
			};
		});
	} catch (error) {
		log.error('[RouteCache] Error setting route in cache:', error);
		throw error;
	}
}

/**
 * Evict all routes for a specific employee
 * @param employeeId - Employee ID
 */
export async function evictAllRoutes(employeeId: string): Promise<void> {
	try {
		const db = await initRouteDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const index = store.index('employeeId');
			const request = index.openCursor(IDBKeyRange.only(employeeId));

			let deletedCount = 0;

			request.onerror = () => {
				log.error('[RouteCache] Error evicting routes:', request.error);
				reject(request.error);
			};

			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
				if (cursor) {
					cursor.delete();
					deletedCount++;
					cursor.continue();
				} else {
					log.info(`[RouteCache] Evicted ${deletedCount} routes for employee ${employeeId}`);
					resolve();
				}
			};
		});
	} catch (error) {
		log.error('[RouteCache] Error evicting all routes:', error);
		throw error;
	}
}

/**
 * Evict all routes for an employee except the one specified
 * @param employeeId - Employee ID
 * @param keepRouteKey - Route key to keep (format: employeeId_startPlaceId_endPlaceId)
 */
export async function evictRoutesExcept(
	employeeId: string,
	keepRouteKey: string
): Promise<void> {
	try {
		const db = await initRouteDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction([STORE_NAME], 'readwrite');
			const store = transaction.objectStore(STORE_NAME);
			const index = store.index('employeeId');
			const request = index.openCursor(IDBKeyRange.only(employeeId));

			let deletedCount = 0;

			request.onerror = () => {
				log.error('[RouteCache] Error evicting routes:', request.error);
				reject(request.error);
			};

			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
				if (cursor) {
					const entry = cursor.value as RouteCacheEntry;
					if (entry.routeKey !== keepRouteKey) {
						cursor.delete();
						deletedCount++;
					}
					cursor.continue();
				} else {
					log.info(
						`[RouteCache] Evicted ${deletedCount} routes for employee ${employeeId} (kept ${keepRouteKey})`
					);
					resolve();
				}
			};
		});
	} catch (error) {
		log.error('[RouteCache] Error evicting routes except:', error);
		throw error;
	}
}

// ============================================================================
// Active Job Route Cache (Redis-based, accessed via API)
// These functions are for the old active job route system
// ============================================================================

/**
 * Get route data for an active job from the API
 * This fetches from the server's Redis cache via /api/active-routes/[activeJobId]
 * 
 * @param activeJobId - Active job ID
 * @returns Route data (parsed JSON) or null if not found
 */
export async function getRoute(activeJobId: string): Promise<any | null> {
	try {
		const response = await fetch(`/api/active-routes/${activeJobId}`);
		
		if (!response.ok) {
			if (response.status === 404) {
				log.info(`[RouteCache] Route not found for active job ${activeJobId}`);
				return null;
			}
			throw new Error(`Failed to fetch route: ${response.statusText}`);
		}

		// Check if response is gzipped
		const contentType = response.headers.get('content-type');
		const contentEncoding = response.headers.get('content-encoding');
		
		if (contentEncoding === 'gzip' || contentType?.includes('gzip')) {
			// Response is gzipped, browser will auto-decompress
			const data = await response.json();
			return data;
		} else {
			// Response is JSON
			const data = await response.json();
			return data;
		}
	} catch (error) {
		log.error(`[RouteCache] Error fetching route for active job ${activeJobId}:`, error);
		return null;
	}
}

/**
 * Prefetch routes for multiple active jobs
 * This is a no-op for now (routes are fetched on-demand when needed)
 * Can be extended to prefetch routes in parallel if needed
 * 
 * @param activeJobIds - Array of active job IDs
 */
export async function prefetchRoutes(activeJobIds: string[]): Promise<void> {
	// Routes are fetched on-demand when needed, so this is a no-op
	// Can be extended to prefetch routes in parallel if performance is needed
	log.debug(`[RouteCache] Prefetch requested for ${activeJobIds.length} active jobs (no-op, routes fetched on-demand)`);
}
