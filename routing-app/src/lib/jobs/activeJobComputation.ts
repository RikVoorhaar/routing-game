import { db } from '$lib/server/db';
import { addresses, activeJobs, activeRoutes } from '$lib/server/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getShortestPath } from '$lib/routes/routing';
import type { Employee, Job, GameState, RoutingResult, Address } from '$lib/server/db/schema';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { concatenateRoutes, applyMaxSpeed } from '$lib/routes/route-utils';
import { config } from '$lib/server/config';
import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
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

type ActiveJobInsert = InferInsertModel<typeof activeJobs>;
type ActiveRouteInsert = InferInsertModel<typeof activeRoutes>;

/**
 * Creates a route from employee's current location to job start location using the routing engine
 */
async function computeRouteToJob(
	employee: Employee,
	jobStartAddressId: string,
	addressMap?: Map<string, Address>
): Promise<RoutingResult> {
	const timer = time('computeRouteToJob');
	// Employee location is a Coordinate (lat/lon)
	const employeeLocation = employee.location;

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

	// Use the routing engine to compute the actual route with employee's max speed
	const employeeMaxSpeed = getEmployeeMaxSpeed(employee);

	const routingTimer = time('routing_employee_to_job');
	const routingResult = await getShortestPath(
		{ lat: employeeLocation.lat, lon: employeeLocation.lon },
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
 * Main function to compute all aspects of an active job
 */
export async function computeActiveJob(
	employee: Employee,
	job: Job,
	gameState: GameState,
	addressMap?: Map<string, Address>
): Promise<{ activeJob: ActiveJobInsert; activeRoute: ActiveRouteInsert }> {
	const totalTimer = time(`computeActiveJob_job_${job.id}`);
	
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
		// Compute route from employee to job start
		computeRouteToJob(employee, job.startAddressId, addressMap)
	]);
	routingTimer();

	// Modify route (concatenate and apply speed multipliers)
	const modifyTimer = time('modify_route');
	const modifiedRoute = modifyRoute(routeToJob, jobRoute, employee, gameState, job);
	modifyTimer();

	// Create the ids, as they reference each other
	const activeRouteId = nanoid();
	const activeJobId = nanoid();

	// Serialize route JSON and compress with gzip
	const serializeTimer = time('serialize_and_compress');
	const routeJson = JSON.stringify(modifiedRoute);
	const routeDataGzip = gzipSync(Buffer.from(routeJson, 'utf-8'));
	serializeTimer();

	// Create the active route data structure with gzipped route data
	const activeRoute: ActiveRouteInsert = {
		id: activeRouteId,
		activeJobId: activeJobId,
		routeDataGzip: routeDataGzip
	};

	// Compute payout
	const computedPayout = computeJobReward(job.totalDistanceKm, config, gameState);

	const xp = computeJobXp(job, config, gameState);

	// Create the active job data structure
	const activeJob: ActiveJobInsert = {
		id: activeJobId,
		employeeId: employee.id,
		jobId: job.id,
		gameStateId: gameState.id,
		durationSeconds: modifiedRoute.travelTimeSeconds,
		reward: computedPayout,
		xp,
		jobCategory: job.jobCategory,
		employeeStartLocation: employee.location,
		jobPickupAddress: job.startAddressId,
		jobDeliverAddress: job.endAddressId
	};

	totalTimer();
	return { activeJob, activeRoute };
}
