import { db } from '$lib/server/db';
import { routes, addresses } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { modifyRoute } from '$lib/jobAssignment';
import { getShortestPath } from '$lib/routing';
import type { Employee, Job, GameState, Address, Route } from '$lib/server/db/schema';

export interface ActiveJobComputation {
	activeJob: {
		id: string;
		employeeId: string;
		jobId: number;
		routeToJobId: string | null;
		jobRouteId: string;
		startTime: Date;
		endTime: Date | null;
		modifiedRouteToJobData: unknown;
		modifiedJobRouteData: unknown;
		currentPhase: 'traveling_to_job' | 'on_job';
		jobPhaseStartTime: Date | null;
	};
	totalTravelTime: number;
	computedPayout: number;
	routeToJobTime: number;
	jobRouteTime: number;
}

/**
 * Computes the value/payout for a given job based on employee skills and game state
 */
export function computeJobValue(job: Job, _employee: Employee, _gameState: GameState): number {
	// TODO: Implement job value computation
	const baseReward = parseFloat(job.approximateValue);

	return baseReward;
}

/**
 * Computes the time taken for traveling to job + completing the job
 */
export function computeJobTiming(
	routeToJobData: unknown,
	jobRouteData: unknown
): { routeToJobTime: number; jobRouteTime: number; totalTime: number } {
	const routeToJobTime =
		((routeToJobData as Record<string, unknown>)?.travelTimeSeconds as number) || 0;
	const jobRouteTime =
		((jobRouteData as Record<string, unknown>)?.travelTimeSeconds as number) || 0;

	return {
		routeToJobTime,
		jobRouteTime,
		totalTime: routeToJobTime + jobRouteTime
	};
}

/**
 * Creates a route from employee's current location to job start location using the routing engine
 */
export async function createRouteToJob(
	employee: Employee,
	jobStartAddressId: string
): Promise<string> {
	// Parse employee location (which should be an Address object)
	let employeeLocation: Address;
	try {
		if (typeof employee.location === 'string') {
			employeeLocation = JSON.parse(employee.location);
		} else {
			employeeLocation = employee.location as Address;
		}
	} catch {
		throw new Error('Invalid employee location format');
	}

	if (!employeeLocation || !employeeLocation.lat || !employeeLocation.lon) {
		throw new Error('Employee has no valid current location');
	}

	// Get the job start address
	const [jobStartAddress] = await db
		.select()
		.from(addresses)
		.where(eq(addresses.id, jobStartAddressId))
		.limit(1);

	if (!jobStartAddress) {
		throw new Error('Job start address not found');
	}

	// Use the routing engine to compute the actual route
	// For now, we'll use default max speed - could be enhanced later with employee vehicle data
	const routingResult = await getShortestPath(
		{ lat: parseFloat(employeeLocation.lat), lon: parseFloat(employeeLocation.lon) },
		{ lat: parseFloat(jobStartAddress.lat), lon: parseFloat(jobStartAddress.lon) }
	);

	// Create the route entry in the database
	const routeId = nanoid();
	await db.insert(routes).values({
		id: routeId,
		startAddressId: employeeLocation.id,
		endAddressId: jobStartAddressId,
		lengthTime: routingResult.travelTimeSeconds.toString(),
		goodsType: 'none', // No goods for travel route
		weight: '0',
		reward: '0', // No reward for travel
		routeData: {
			path: routingResult.path,
			travelTimeSeconds: routingResult.travelTimeSeconds,
			totalDistanceMeters: routingResult.totalDistanceMeters,
			destination: routingResult.destination
		}
	});

	return routeId;
}

/**
 * Main function to compute all aspects of an active job
 */
export async function computeActiveJob(
	employee: Employee,
	job: Job,
	gameState: GameState
): Promise<ActiveJobComputation> {
	// Get the job's route details
	const [jobRoute] = await db.select().from(routes).where(eq(routes.id, job.routeId)).limit(1);

	if (!jobRoute) {
		throw new Error('Job route not found');
	}

	// Always create a route from employee location to job start
	const routeToJobId = await createRouteToJob(employee, jobRoute.startAddressId);

	// Get the route we just created
	const routeToJob: Route | undefined = await db.query.routes.findFirst({
		where: eq(routes.id, routeToJobId)
	});

	if (!routeToJob) {
		throw new Error('Failed to create route to job');
	}

	// Apply employee modifiers to both routes
	const originalRouteToJobData = routeToJob.routeData;
	const originalJobRouteData = jobRoute.routeData;

	const modifiedRouteToJobData = modifyRoute(originalRouteToJobData, employee);
	const modifiedJobRouteData = modifyRoute(originalJobRouteData, employee);

	// Compute timing
	const timing = computeJobTiming(modifiedRouteToJobData, modifiedJobRouteData);

	// Compute payout
	const computedPayout = computeJobValue(job, employee, gameState);

	// Create the active job data structure
	const activeJobId = nanoid();
	const activeJob = {
		id: activeJobId,
		employeeId: employee.id,
		jobId: job.id,
		routeToJobId: routeToJobId,
		jobRouteId: jobRoute.id,
		startTime: new Date(),
		endTime: null,
		modifiedRouteToJobData: modifiedRouteToJobData,
		modifiedJobRouteData: modifiedJobRouteData,
		currentPhase: 'traveling_to_job' as const,
		jobPhaseStartTime: null // Will be set when job is accepted
	};

	return {
		activeJob,
		totalTravelTime: timing.totalTime,
		computedPayout,
		routeToJobTime: timing.routeToJobTime,
		jobRouteTime: timing.jobRouteTime
	};
}
