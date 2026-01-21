import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, gameStates, places, activeJobs, travelJobs } from '$lib/server/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { serverLog } from '$lib/server/logging/serverLogger';
import { nanoid } from 'nanoid';
import { getCompleteJobRoute } from '$lib/routes/routing';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';
import { config } from '$lib/server/config';
import { computeJobXp } from '$lib/jobs/jobUtils';
import { computeCompleteJobValue } from '$lib/jobs/jobValue';
import { generateSupplyAmount } from '$lib/places/supplyAmount';
import { selectPlaceGoods } from '$lib/places/placeGoodsSelection';
import { setRoute } from '$lib/server/routeCache/activeRouteCache';
import type { Coordinate } from '$lib/server/db/schema';
import { placeGoodsConfig } from '$lib/server/config/placeGoods';
import { getVehicleConfig } from '$lib/vehicles/vehicleUtils';
import { evictRoutesExcept, getRouteKey } from '$lib/stores/routeCache';
import { mapGoodToCategory } from '$lib/jobs/goodToCategory';

// POST /api/jobs/accept-from-places
// Body: { employeeId, gameStateId, supplyPlaceId, demandPlaceId }
// Creates an active job from selected supply and demand places
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { employeeId, gameStateId, supplyPlaceId, demandPlaceId } = await request.json();

		if (!employeeId || !gameStateId || !supplyPlaceId || !demandPlaceId) {
			return error(400, 'Employee ID, game state ID, supply place ID, and demand place ID are required');
		}

		serverLog.api.info(
			{ employeeId, gameStateId, supplyPlaceId, demandPlaceId },
			'Accepting job from places'
		);

		// Verify the game state belongs to the current user
		const gameState = await db.query.gameStates.findFirst({
			where: and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id))
		});

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get employee
		const employee = await db.query.employees.findFirst({
			where: and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId))
		});

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Check if employee has an active job with startTime or travel job
		const [activeJobWithStartTime, activeTravelJob] = await Promise.all([
			db.query.activeJobs.findFirst({
				where: and(
					eq(activeJobs.employeeId, employeeId),
					eq(activeJobs.gameStateId, gameStateId),
					isNotNull(activeJobs.startTime)
				)
			}),
			db.query.travelJobs.findFirst({
				where: and(
					eq(travelJobs.employeeId, employeeId),
					eq(travelJobs.gameStateId, gameStateId),
					isNotNull(travelJobs.startTime)
				)
			})
		]);

		if (activeJobWithStartTime || activeTravelJob) {
			return error(400, 'Employee is currently on a job or traveling');
		}

		// Get places
		const [supplyPlace, demandPlace] = await Promise.all([
			db.query.places.findFirst({
				where: eq(places.id, supplyPlaceId)
			}),
			db.query.places.findFirst({
				where: eq(places.id, demandPlaceId)
			})
		]);

		if (!supplyPlace) {
			return error(404, 'Supply place not found');
		}

		if (!demandPlace) {
			return error(404, 'Demand place not found');
		}

		// Verify supply/demand relationship
		if (!placeGoodsConfig) {
			return error(500, 'Place goods configuration not available');
		}

		const supplyCategory = placeGoodsConfig.categories.find((cat) => cat.name === supplyPlace.category);
		const demandCategory = placeGoodsConfig.categories.find((cat) => cat.name === demandPlace.category);

		if (!supplyCategory || !demandCategory) {
			return error(400, 'Invalid place categories');
		}

		const supplyGoods = selectPlaceGoods(gameState.seed, supplyPlace.id, supplyCategory);
		const demandGoods = selectPlaceGoods(gameState.seed, demandPlace.id, demandCategory);

		if (supplyGoods.type !== 'supply' || demandGoods.type !== 'demand') {
			return error(400, 'Places must be supply and demand respectively');
		}

		if (supplyGoods.good !== demandGoods.good) {
			return error(400, 'Supply and demand places must trade the same good');
		}

		// Use place IDs directly - no need to create addresses

		// Compute route from employee location to supply, then supply to demand
		const employeeMaxSpeed = getEmployeeMaxSpeed(employee);
		const speedMultiplier = config.dev.speedMultiplier;

		const { compressedRouteData, durationSeconds } = await getCompleteJobRoute(
			employee.location,
			{ lat: supplyPlace.lat, lon: supplyPlace.lon },
			{ lat: demandPlace.lat, lon: demandPlace.lon },
			{
				maxSpeed: employeeMaxSpeed,
				speedMultiplier
			}
		);

		// Calculate job value
		const supplyAmount = generateSupplyAmount(gameState.seed, supplyPlace.id, supplyCategory);
		const vehicleConfig = getVehicleConfig(employee.vehicleLevel);
		const vehicleCapacity = vehicleConfig?.capacity ?? 0;
		const goodValue = placeGoodsConfig.goods?.[supplyGoods.good]?.value_per_kg ?? 0;

		const jobReward = computeCompleteJobValue(
			goodValue,
			supplyAmount,
			vehicleCapacity,
			gameState.seed,
			supplyPlace.id,
			gameState,
			config.jobs.value.randomFactorMax
		);

		// Map good to job category
		const jobCategory = mapGoodToCategory(supplyGoods.good);
		
		// Calculate XP (based on route distance)
		// Estimate distance from duration and average speed (assume 60% of max speed as average)
		// This accounts for stops, traffic, and varying road speeds
		const averageSpeedKmh = employeeMaxSpeed * 0.6;
		const estimatedDistanceKm = (durationSeconds * averageSpeedKmh) / 3600;
		const jobXp = computeJobXp(
			{
				totalDistanceKm: estimatedDistanceKm,
				jobCategory
			} as any,
			config,
			gameState
		);

		// Create active job
		const activeJobId = nanoid();
		const startTime = new Date();

		// Store route in Redis
		const ttlSeconds = 24 * 3600; // 24 hours
		await setRoute(activeJobId, compressedRouteData, ttlSeconds);

		// Create active job entry and clear other active jobs in a transaction
		const newActiveJob = await db.transaction(async (tx) => {
			// Delete all other active jobs for this employee (including pending ones)
			await tx
				.delete(activeJobs)
				.where(
					and(
						eq(activeJobs.employeeId, employeeId),
						eq(activeJobs.gameStateId, gameStateId)
					)
				);

			// Create new active job with startTime
			const result = await tx
				.insert(activeJobs)
				.values({
					id: activeJobId,
					employeeId: employee.id,
					jobId: null, // Place-based jobs don't have a job ID
					gameStateId: gameState.id,
					durationSeconds,
					reward: jobReward,
					xp: jobXp,
					jobCategory,
				employeeStartLocation: employee.location,
				jobPickupPlaceId: supplyPlace.id,
				jobDeliverPlaceId: demandPlace.id,
				startRegion: supplyPlace.region,
				endRegion: demandPlace.region,
				startTime // Set startTime immediately when accepting
				})
				.returning();

			return result;
		});

		if (newActiveJob.length === 0) {
			return error(500, 'Failed to create active job');
		}

		// Evict all routes except the one being used
		try {
			const routeKey = getRouteKey(employeeId, supplyPlaceId, demandPlaceId);
			await evictRoutesExcept(employeeId, routeKey);
		} catch (error) {
			serverLog.api.warn(
				{
					employeeId,
					error: error instanceof Error ? error.message : String(error)
				},
				'Failed to evict routes cache'
			);
		}

		serverLog.api.info(
			{
				activeJobId,
				employeeId,
				supplyPlaceId,
				demandPlaceId,
				reward: jobReward,
				durationSeconds
			},
			'Job accepted from places'
		);

		// Return places for response
		return json({
			activeJob: newActiveJob[0],
			employeeStartLocation: employee.location,
			jobPickupPlace: supplyPlace,
			jobDeliverPlace: demandPlace
		});
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : String(err);
		serverLog.api.error(
			{
				error: errorMessage,
				stack: err instanceof Error ? err.stack : undefined
			},
			'Error accepting job from places'
		);

		return error(500, `Failed to accept job: ${errorMessage}`);
	}
};
