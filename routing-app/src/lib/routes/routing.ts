import { getRandomAddressInAnnulus } from '../addresses';
import type { Address } from '../server/db/schema';
import type { Coordinate, RoutingResult, PathPoint } from '../server/db/schema';
import http from 'http';
import { gunzipSync } from 'zlib';
import { profiledAsync, profiledSync } from '../profiling';

// Get ROUTING_SERVER_URL from environment (checked lazily when functions are called)
function getRoutingServerUrl(): string {
	const url = (typeof process !== 'undefined' && process.env?.ROUTING_SERVER_URL) || '';
	if (!url) {
		throw new Error(
			'ROUTING_SERVER_URL is not set. Ensure .env file exists and dotenv.config() is called.'
		);
	}
	return url;
}

// Reuse the same HTTP agent for connection pooling
const httpAgent = new http.Agent({
	keepAlive: true,
	keepAliveMsecs: 30000,
	maxSockets: 50,
	maxFreeSockets: 10
});

// Enhanced fetch with keep-alive agent
async function fetchWithKeepAlive(url: string, options: RequestInit = {}): Promise<Response> {
	return await profiledAsync('routing.http.fetch', async () => {
		return await fetch(url, {
			...options,
			// @ts-expect-error - Node.js specific agent option
			agent: httpAgent
		});
	});
}

interface ServerPathPoint {
	coordinates: { lat: number; lon: number };
	cumulative_time_seconds: number;
	cumulative_distance_meters: number;
	max_speed_kmh: number;
	is_walking_segment: boolean;
}

interface ShortestPathOptions {
	maxSpeed?: number;
	includePath?: boolean; // If false, returns metadata only (no path array)
}

export interface CompleteJobRouteOptions {
	maxSpeed?: number;
	speedMultiplier?: number;
}

export interface CompleteJobRouteResult {
	compressedRouteData: Buffer;
	durationSeconds: number;
}

async function getShortestPath(
	from: Coordinate,
	to: Coordinate,
	options?: ShortestPathOptions | number // Support legacy maxSpeed parameter
): Promise<RoutingResult> {
	const ROUTING_SERVER_URL = getRoutingServerUrl();

	// Handle legacy maxSpeed parameter
	const opts: ShortestPathOptions =
		typeof options === 'number' ? { maxSpeed: options } : options || {};

	let url = `${ROUTING_SERVER_URL}/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`;

	if (opts.maxSpeed !== undefined && opts.maxSpeed > 0) {
		url += `&max_speed=${opts.maxSpeed}`;
	}

	if (opts.includePath === false) {
		url += `&include_path=0`;
	}

	const response = await fetchWithKeepAlive(url);

	if (!response.ok) {
		throw new Error(`Failed to get shortest path: ${response.statusText}`);
	}

	const data = await profiledAsync('routing.http.json', async () => await response.json());
	if (!data.success) {
		throw new Error(data.error || 'Failed to get shortest path ' + url);
	}

	// Convert the path to our PathPoint type (only if path is included)
	const path: PathPoint[] = data.path
		? profiledSync('routing.path.map', () =>
				data.path.map((point: ServerPathPoint) => ({
					coordinates: { lat: point.coordinates.lat, lon: point.coordinates.lon },
					cumulative_time_seconds: point.cumulative_time_seconds,
					cumulative_distance_meters: point.cumulative_distance_meters,
					max_speed_kmh: point.max_speed_kmh,
					is_walking_segment: point.is_walking_segment
				}))
			)
		: []; // Empty path array for metadata-only responses

	return {
		path,
		travelTimeSeconds: data.travel_time_seconds,
		totalDistanceMeters: data.total_distance_meters,
		destination: {
			id: data.destination_id || 'unknown',
			street: null,
			houseNumber: null,
			postcode: null,
			city: null,
			location: `POINT(${to.lon} ${to.lat})`,
			lat: to.lat,
			lon: to.lon,
			createdAt: new Date()
		}
	};
}

export interface RouteInAnnulus {
	route: RoutingResult;
	destination: Address;
}

export async function getRandomRouteInAnnulus(
	from: Coordinate,
	minDistance: number,
	maxDistance: number,
	maxSpeed?: number,
	includePath: boolean = true
): Promise<RouteInAnnulus> {
	// Get a random destination address in the annulus
	const destination = await getRandomAddressInAnnulus(from, minDistance, maxDistance);

	// Get the route to that destination (with optional path inclusion)
	const routingResult = await getShortestPath(from, destination, {
		maxSpeed,
		includePath
	});

	// Preserve the full destination address information
	return {
		route: routingResult,
		destination
	};
}

/**
 * Get a complete job route from start → pickup → delivery.
 * Returns compressed route data and duration without decompressing the body.
 * Metadata is read from HTTP headers to avoid decompression/recompression overhead.
 */
export async function getCompleteJobRoute(
	from: Coordinate,
	via: Coordinate,
	to: Coordinate,
	options?: CompleteJobRouteOptions
): Promise<CompleteJobRouteResult> {
	// Validate coordinates
	if (
		typeof from?.lat !== 'number' ||
		typeof from?.lon !== 'number' ||
		typeof via?.lat !== 'number' ||
		typeof via?.lon !== 'number' ||
		typeof to?.lat !== 'number' ||
		typeof to?.lon !== 'number' ||
		!isFinite(from.lat) ||
		!isFinite(from.lon) ||
		!isFinite(via.lat) ||
		!isFinite(via.lon) ||
		!isFinite(to.lat) ||
		!isFinite(to.lon)
	) {
		throw new Error(
			`Invalid coordinates: from=${JSON.stringify(from)}, via=${JSON.stringify(via)}, to=${JSON.stringify(to)}`
		);
	}

	const ROUTING_SERVER_URL = getRoutingServerUrl();

	let url = `${ROUTING_SERVER_URL}/api/v1/complete_job_route?from=${from.lat},${from.lon}&via=${via.lat},${via.lon}&to=${to.lat},${to.lon}`;

	if (options?.maxSpeed !== undefined && options.maxSpeed > 0) {
		url += `&max_speed=${options.maxSpeed}`;
	}

	if (options?.speedMultiplier !== undefined && options.speedMultiplier > 0) {
		url += `&speed_multiplier=${options.speedMultiplier}`;
	}

	// Use http module directly to get raw compressed data without auto-decompression
	// fetch API automatically decompresses when Content-Encoding: gzip is present
	const { URL } = await import('url');
	const parsedUrl = new URL(url);

	const { compressedRouteData, durationSeconds } = await profiledAsync(
		'routing.http.raw',
		async () => {
			return new Promise<{ compressedRouteData: Buffer; durationSeconds: number }>(
				(resolve, reject) => {
					const req = http.request(
						{
							hostname: parsedUrl.hostname,
							port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
							path: parsedUrl.pathname + parsedUrl.search,
							method: 'GET',
							agent: httpAgent
						},
						(res) => {
							// Read headers first
							const travelTimeSecondsHeader = res.headers['x-travel-time-seconds'];
							const successHeader = res.headers['x-success'];
							const errorHeader = res.headers['x-error'];

							if (res.statusCode !== 200) {
								// Try to read error from body
								const chunks: Buffer[] = [];
								res.on('data', (chunk) => chunks.push(chunk));
								res.on('end', () => {
									try {
										// Try to decompress and parse error JSON
										const buffer = Buffer.concat(chunks);
										const decompressed = gunzipSync(buffer);
										const errorData = JSON.parse(decompressed.toString('utf-8'));
										const errorMessage =
											errorData.error || errorData.message || 'Failed to get complete job route';
										reject(new Error(`${errorMessage} (status: ${res.statusCode})`));
									} catch {
										// If decompression/parsing fails, use status message
										reject(
											new Error(
												`Failed to get complete job route: ${res.statusCode} ${res.statusMessage}`
											)
										);
									}
								});
								return;
							}

							if (!successHeader || successHeader !== 'true') {
								const errorText = errorHeader || 'Failed to get complete job route';
								reject(new Error(errorText));
								return;
							}

							if (!travelTimeSecondsHeader) {
								reject(new Error('Missing X-Travel-Time-Seconds header in response'));
								return;
							}

							const durationSeconds = parseFloat(travelTimeSecondsHeader);
							if (isNaN(durationSeconds)) {
								reject(
									new Error(
										`Invalid X-Travel-Time-Seconds header value: ${travelTimeSecondsHeader}`
									)
								);
								return;
							}

							// Read raw compressed body
							const chunks: Buffer[] = [];
							res.on('data', (chunk) => chunks.push(chunk));
							res.on('end', () => {
								const buffer = Buffer.concat(chunks);
								resolve({
									compressedRouteData: buffer,
									durationSeconds
								});
							});
							res.on('error', reject);
						}
					);
					req.on('error', reject);
					req.end();
				}
			);
		}
	);

	return {
		compressedRouteData,
		durationSeconds
	};
}
