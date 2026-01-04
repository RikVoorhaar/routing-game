import { db } from '$lib/server/db';
import { addresses, activeJobs } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getShortestPath } from '$lib/routes/routing';
import type { Employee, Job, GameState, RoutingResult, Address, Coordinate } from '$lib/server/db/schema';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { concatenateRoutes, applyMaxSpeed } from '$lib/routes/route-utils';
import { config } from '$lib/server/config';
import { gzipSync } from 'zlib';
import { serverLog } from '$lib/server/logging/serverLogger';

/**
 * Performance timing helper - logs at INFO level so it's always visible
 */
function time(label: string): () => void {
	const start = performance.now();
	return () => {
		const duration = performance.now() - start;
		serverLog.api.info({ duration_ms: Math.round(duration * 100) / 100, label }, '⏱️ Timing');
	};
}

/**
 * Creates a route from a start location to job start location using the routing engine
 */
async function computeRouteToJob(
	startLocation: Coordinate,
	jobStartAddressId: string,
	employeeMaxSpeed: number,
	addressMap?: Map<string, Address>
): Promise<RoutingResult> {
	const timer = time('computeRouteToJob');

	// Get the job start address (from cache if provided, otherwise fetch)
	const addressTimer = time('fetch_address_to_job');
	let jobStartAddress: Address | undefined;
	if (addressMap) {
		jobStartAddress = addressMap.get(jobStartAddressId);
	} else {
		jobStartAddress = await db.query.addresses.findFirst({
			where: eq(addresses.id, jobStartAddressId)
		});
	}
	addressTimer();

	if (!jobStartAddress) {
		throw new Error('Job start address not found');
	}

	const routingTimer = time('routing_to_job');
	const routingResult = await getShortestPath(
		{ lat: startLocation.lat, lon: startLocation.lon },
		{ lat: jobStartAddress.lat, lon: jobStartAddress.lon },
		{ maxSpeed: employeeMaxSpeed, includePath: true }
	);
	routingTimer();
	timer();

	return routingResult;
}

function getMultiplier(_employee: Employee, _gameState: GameState, _job: Job): number {
	// TODO: implement this logic
	return 1.0;
}

/**
 * Compute the modified route based on the employee, game state, job, route to job and job route.
 */
function modifyRoute(
	routeToJob: RoutingResult,
	jobRoute: RoutingResult,
	employee: Employee,
	gameState: GameState,
	job: Job
): RoutingResult {
	const concatRoute = concatenateRoutes(routeToJob, jobRoute);

	// Get employee's max speed including upgrades
	const maxSpeedKmh = getEmployeeMaxSpeed(employee);

	const multiplier = getMultiplier(employee, gameState, job);

	// Apply dev speed multiplier to route times
	const speedMultiplier = multiplier * config.dev.speedMultiplier;

	const modifiedRoute = applyMaxSpeed(concatRoute, maxSpeedKmh, speedMultiplier);

	return modifiedRoute;
}

/**
 * Compute a route for an active job using the stored employeeStartLocation
 * This is the reusable helper that can be called from both job-search (if needed) and active-routes endpoints
 *
 * Parameters
 * -----------
 * activeJobId: string
 *     The active job ID (for linking the route)
 * activeJob: { employeeStartLocation: Coordinate; jobPickupAddress: string; jobDeliverAddress: string }
 *     The active job data (must have employeeStartLocation set)
 * job: Job
 *     The job record
 * employee: Employee
 *     The employee record (for speed calculations)
 * gameState: GameState
 *     The game state (for multipliers)
 * addressMap?: Map<string, Address>
 *     Optional pre-fetched address map for performance
 *
 * Returns
 * --------
 * { activeRoute: ActiveRouteInsert, durationSeconds: number }
 *     The computed active route with gzipped data and the actual duration
 */
export async function computeActiveRouteForActiveJob(
	activeJobId: string,
	activeJob: { employeeStartLocation: Coordinate; jobPickupAddress: string; jobDeliverAddress: string },
	job: Job,
	employee: Employee,
	gameState: GameState,
	addressMap?: Map<string, Address>
): Promise<{ activeRoute: ActiveRouteInsert; durationSeconds: number }> {
	const totalTimer = time(`computeActiveRouteForActiveJob_job_${job.id}`);

	// Get job start and end addresses (from cache if provided, otherwise fetch)
	const addressTimer = time('fetch_job_addresses');
	let jobStartAddress: Address | undefined;
	let jobEndAddress: Address | undefined;

	if (addressMap) {
		jobStartAddress = addressMap.get(job.startAddressId);
		jobEndAddress = addressMap.get(job.endAddressId);
	} else {
		[jobStartAddress, jobEndAddress] = await Promise.all([
			db.query.addresses.findFirst({
				where: eq(addresses.id, job.startAddressId)
			}),
			db.query.addresses.findFirst({
				where: eq(addresses.id, job.endAddressId)
			})
		]);
	}
	addressTimer();

	if (!jobStartAddress || !jobEndAddress) {
		throw new Error('Job addresses not found');
	}

	// Get employee's max speed
	const employeeMaxSpeed = getEmployeeMaxSpeed(employee);

	// Parallelize the two routing calls - they're independent
	const routingTimer = time('parallel_routing_calls');
	const [jobRoute, routeToJob] = await Promise.all([
		// Compute the job route on-demand using the routing server with employee's effective speed
		(async () => {
			const t = time('routing_job_route');
			const result = await getShortestPath(
				{ lat: jobStartAddress.lat, lon: jobStartAddress.lon },
				{ lat: jobEndAddress.lat, lon: jobEndAddress.lon },
				{ maxSpeed: employeeMaxSpeed, includePath: true }
			);
			t();
			return result;
		})(),
		// Compute route from employeeStartLocation to job start (using stored location, not current)
		computeRouteToJob(activeJob.employeeStartLocation, job.startAddressId, employeeMaxSpeed, addressMap)
	]);
	routingTimer();

	// Modify route (concatenate and apply speed multipliers)
	const modifyTimer = time('modify_route');
	const modifiedRoute = modifyRoute(routeToJob, jobRoute, employee, gameState, job);
	modifyTimer();

	// Serialize route JSON and compress with gzip
	const serializeTimer = time('serialize_and_compress');
	const routeJson = JSON.stringify(modifiedRoute);
	const routeDataGzip = gzipSync(Buffer.from(routeJson, 'utf-8'));
	serializeTimer();

	totalTimer();
	return { routeDataGzip, durationSeconds: modifiedRoute.travelTimeSeconds };
}
