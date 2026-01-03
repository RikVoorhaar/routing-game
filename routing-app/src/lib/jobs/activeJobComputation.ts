import { db } from '$lib/server/db';
import { addresses, activeJobs, activeRoutes } from '$lib/server/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getShortestPath } from '$lib/routes/routing';
import type { Employee, Job, GameState, RoutingResult } from '$lib/server/db/schema';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { concatenateRoutes, applyMaxSpeed } from '$lib/routes/route-utils';
import { config } from '$lib/server/config';
import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
import { gzipSync } from 'zlib';

type ActiveJobInsert = InferInsertModel<typeof activeJobs>;
type ActiveRouteInsert = InferInsertModel<typeof activeRoutes>;

/**
 * Creates a route from employee's current location to job start location using the routing engine
 */
async function computeRouteToJob(
	employee: Employee,
	jobStartAddressId: string
): Promise<RoutingResult> {
	// Employee location is a Coordinate (lat/lon)
	const employeeLocation = employee.location;

	// Get the job start address
	const jobStartAddress = await db.query.addresses.findFirst({
		where: eq(addresses.id, jobStartAddressId)
	});

	if (!jobStartAddress) {
		throw new Error('Job start address not found');
	}

	// Use the routing engine to compute the actual route with employee's max speed
	const employeeMaxSpeed = getEmployeeMaxSpeed(employee);
	
	const routingResult = await getShortestPath(
		{ lat: employeeLocation.lat, lon: employeeLocation.lon },
		{ lat: jobStartAddress.lat, lon: jobStartAddress.lon },
		{ maxSpeed: employeeMaxSpeed, includePath: true }
	);

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
	gameState: GameState
): Promise<{ activeJob: ActiveJobInsert; activeRoute: ActiveRouteInsert }> {
	// Get job start and end addresses
	const [jobStartAddress, jobEndAddress] = await Promise.all([
		db.query.addresses.findFirst({
			where: eq(addresses.id, job.startAddressId)
		}),
		db.query.addresses.findFirst({
			where: eq(addresses.id, job.endAddressId)
		})
	]);

	if (!jobStartAddress || !jobEndAddress) {
		throw new Error('Job addresses not found');
	}

	// Get employee's max speed
	const employeeMaxSpeed = getEmployeeMaxSpeed(employee);

	// Compute the job route on-demand using the routing server with employee's effective speed
	const jobRoute = await getShortestPath(
		{ lat: jobStartAddress.lat, lon: jobStartAddress.lon },
		{ lat: jobEndAddress.lat, lon: jobEndAddress.lon },
		{ maxSpeed: employeeMaxSpeed, includePath: true }
	);

	// Compute route from employee to job start
	const routeToJob = await computeRouteToJob(employee, job.startAddressId);

	// Modify route (concatenate and apply speed multipliers)
	const modifiedRoute = modifyRoute(routeToJob, jobRoute, employee, gameState, job);

	// Create the ids, as they reference each other
	const activeRouteId = nanoid();
	const activeJobId = nanoid();

	// Serialize route JSON and compress with gzip
	const routeJson = JSON.stringify(modifiedRoute);
	const routeDataGzip = gzipSync(Buffer.from(routeJson, 'utf-8'));

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

	return { activeJob, activeRoute };
}
