import { db } from '$lib/server/db';
import { addresses, activeJobs } from '$lib/server/db/schema';
import type { InferInsertModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getCompleteJobRoute } from '$lib/routes/routing';
import type { Employee, Job, GameState, Address } from '$lib/server/db/schema';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
import { serverLog } from '$lib/server/logging/serverLogger';
import { setRoute } from '$lib/server/routeCache/activeRouteCache';

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

function getMultiplier(_employee: Employee, _gameState: GameState, _job: Job): number {
	// TODO: implement this logic
	return 1.0;
}

/**
 * Main function to compute all aspects of an active job
 */
export async function computeActiveJob(
	employee: Employee,
	job: Job,
	gameState: GameState,
	addressMap?: Map<string, Address>
): Promise<{ activeJob: ActiveJobInsert; activeRoute: { routeDataGzip: Buffer } }> {
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

	// Calculate speed multiplier
	const multiplier = getMultiplier(employee, gameState, job);
	const speedMultiplier = multiplier * config.dev.speedMultiplier;

	// Create the active job ID
	const activeJobId = nanoid();

	// Compute complete route using the new endpoint (start → pickup → delivery)
	const routingTimer = time('routing_complete_job_route');
	const { compressedRouteData, durationSeconds } = await getCompleteJobRoute(
		employee.location,
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

	// Store route in Redis with 24h TTL
	const ttlSeconds = 24 * 3600; // 24 hours
	await setRoute(activeJobId, routeDataGzip, ttlSeconds);

	// Compute payout
	const computedPayout = computeJobReward(job.totalDistanceKm, config, gameState);

	const xp = computeJobXp(job, config, gameState);

	// Create the active job data structure
	const activeJob: ActiveJobInsert = {
		id: activeJobId,
		employeeId: employee.id,
		jobId: job.id,
		gameStateId: gameState.id,
		durationSeconds,
		reward: computedPayout,
		xp,
		jobCategory: job.jobCategory,
		employeeStartLocation: employee.location,
		jobPickupAddress: job.startAddressId,
		jobDeliverAddress: job.endAddressId
	};

	totalTimer();
	return { activeJob, activeRoute: { routeDataGzip } };
}
