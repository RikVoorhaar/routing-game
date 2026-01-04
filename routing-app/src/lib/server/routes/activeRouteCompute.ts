import { db } from '$lib/server/db';
import { addresses, activeJobs } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getCompleteJobRoute } from '$lib/routes/routing';
import type {
	Employee,
	Job,
	GameState,
	Address,
	Coordinate
} from '$lib/server/db/schema';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
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

function getMultiplier(_employee: Employee, _gameState: GameState, _job: Job): number {
	// TODO: implement this logic
	return 1.0;
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
 * { routeDataGzip: Buffer, durationSeconds: number }
 *     The computed active route with gzipped data and the actual duration
 */
export async function computeActiveRouteForActiveJob(
	activeJobId: string,
	activeJob: {
		employeeStartLocation: Coordinate;
		jobPickupAddress: string;
		jobDeliverAddress: string;
	},
	job: Job,
	employee: Employee,
	gameState: GameState,
	addressMap?: Map<string, Address>
): Promise<{ routeDataGzip: Buffer; durationSeconds: number }> {
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

	// Calculate speed multiplier
	const multiplier = getMultiplier(employee, gameState, job);
	const speedMultiplier = multiplier * config.dev.speedMultiplier;

	// Compute complete route using the new endpoint (start → pickup → delivery)
	const routingTimer = time('routing_complete_job_route');
	const { compressedRouteData, durationSeconds } = await getCompleteJobRoute(
		activeJob.employeeStartLocation,
		{ lat: jobStartAddress.lat, lon: jobStartAddress.lon },
		{ lat: jobEndAddress.lat, lon: jobEndAddress.lon },
		{
			maxSpeed: employeeMaxSpeed,
			speedMultiplier
		}
	);
	routingTimer();

	// Use compressed route data directly (no decompression/recompression)
	const routeDataGzip = compressedRouteData;

	totalTimer();
	return { routeDataGzip, durationSeconds };
}
