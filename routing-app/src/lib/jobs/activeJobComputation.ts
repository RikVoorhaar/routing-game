import { db } from '$lib/server/db';
import { routes, addresses, activeJobs, activeRoutes } from '$lib/server/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getShortestPath } from '$lib/routes/routing';
import type { Employee, Job, GameState, RoutingResult } from '$lib/server/db/schema';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { concatenateRoutes, applyMaxSpeed } from '$lib/routes/route-utils';

type ActiveJobInsert = InferInsertModel<typeof activeJobs>;
type ActiveRouteInsert = InferInsertModel<typeof activeRoutes>;

/**
 * Computes the value/payout for a given job based on employee skills and game state
 */
function computeJobValue(job: Job, _employee: Employee, _gameState: GameState): number {
	// TODO: Implement job value computation
	const baseReward = job.approximateValue;

	return baseReward;
}

/**
 * Creates a route from employee's current location to job start location using the routing engine
 */
async function computeRouteToJob(
	employee: Employee,
	jobStartAddressId: string
): Promise<RoutingResult> {
	// Parse employee location (which should be an Address object)
	const employeeLocation = employee.location;

	// Get the job start address
	const jobStartAddress = await db.query.addresses.findFirst({
		where: eq(addresses.id, jobStartAddressId)
	});

	if (!jobStartAddress) {
		throw new Error('Job start address not found');
	}

	// Use the routing engine to compute the actual route
	// For now, we'll use default max speed - could be enhanced later with employee vehicle data
	const routingResult = await getShortestPath(
		{ lat: employeeLocation.lat, lon: employeeLocation.lon },
		{ lat: jobStartAddress.lat, lon: jobStartAddress.lon }
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

	const modifiedRoute = applyMaxSpeed(concatRoute, maxSpeedKmh, multiplier);

	return modifiedRoute;
}

function computeDrivingXp(job: Job, _employee: Employee, _gameState: GameState): number {
	// TODO: implement this logic
	return Math.floor(job.approximateTimeSeconds / 100);
}

function computeCategoryXp(job: Job, _employee: Employee, _gameState: GameState): number {
	// TODO: implement this logic
	return Math.floor(job.approximateValue / 20);
}

/**
 * Main function to compute all aspects of an active job
 */
export async function computeActiveJob(
	employee: Employee,
	job: Job,
	gameState: GameState
): Promise<{ activeJob: ActiveJobInsert; activeRoute: ActiveRouteInsert }> {
	// Get the job's route details
	const [jobRoute, routeToJob] = await Promise.all([
		db.query.routes.findFirst({
			where: eq(routes.id, job.routeId)
		}),
		computeRouteToJob(employee, job.startAddressId)
	]);

	if (!jobRoute) {
		throw new Error('Job route not found');
	}
	const modifiedRoute = modifyRoute(routeToJob, jobRoute.routeData, employee, gameState, job);

	// Create the ids, as they reference each other
	const activeRouteId = nanoid();
	const activeJobId = nanoid();

	// Create the active route data structure
	const activeRoute: ActiveRouteInsert = {
		id: activeRouteId,
		activeJobId: activeJobId,
		routeData: modifiedRoute
	};

	// Compute payout
	const computedPayout = computeJobValue(job, employee, gameState);

	const drivingXp = computeDrivingXp(job, employee, gameState);
	const categoryXp = computeCategoryXp(job, employee, gameState);

	// Create the active job data structure
	const activeJob = {
		id: activeJobId,
		employeeId: employee.id,
		jobId: job.id,
		gameStateId: gameState.id,
		activeJobRouteId: activeRouteId,
		durationSeconds: modifiedRoute.travelTimeSeconds,
		reward: computedPayout,
		drivingXp: drivingXp,
		jobCategory: job.jobCategory,
		categoryXp: categoryXp,
		employeeStartAddressId: employee.location.id,
		jobAddressId: job.startAddressId,
		employeeEndAddressId: job.endAddressId
	};

	return { activeJob, activeRoute };
}
