import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, gameStates, employees, routes, activeJobs, addresses } from '$lib/server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';

// POST /api/cheats/complete-routes - Instantly complete all active routes (cheats only)
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { gameStateId } = await request.json();

		if (!gameStateId) {
			return error(400, 'Game state ID is required');
		}

		// Check if user has cheats enabled
		const [user] = await db
			.select({ cheatsEnabled: users.cheatsEnabled })
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		if (!user?.cheatsEnabled) {
			return error(403, 'Cheats are not enabled for this user');
		}

		// Verify the game state belongs to the current user
		const [gameState] = await db
			.select()
			.from(gameStates)
			.where(and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id)))
			.limit(1);

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Debug: Let's see what routes exist overall
		const allRoutes = await db.select().from(routes);
		console.log(`[CHEAT] Found ${allRoutes.length} total routes in database:`);
		allRoutes.forEach((route) => {
			console.log(`[CHEAT]   Route ${route.id}: reward=${route.reward}`);
		});

		// Get all employees with active jobs for this game state
		// For the cheat, we'll complete ANY active job an employee is working on
		const employeesWithActiveJobs = await db
			.select({
				employee: employees,
				activeJob: activeJobs,
				route: routes,
				endAddress: addresses
			})
			.from(employees)
			.innerJoin(activeJobs, eq(employees.id, activeJobs.employeeId))
			.innerJoin(routes, eq(activeJobs.jobRouteId, routes.id))
			.innerJoin(addresses, eq(routes.endAddressId, addresses.id))
			.where(
				and(
					eq(employees.gameId, gameStateId),
					isNull(activeJobs.endTime) // Only active (not completed) jobs
				)
			);

		console.log(
			`[CHEAT] Found ${employeesWithActiveJobs.length} employees with active jobs for game ${gameStateId}`
		);

		if (employeesWithActiveJobs.length === 0) {
			console.log(`[CHEAT] No active jobs to complete for game ${gameStateId}`);
			return json({
				success: true,
				message: 'No active jobs to complete',
				completedRoutes: 0,
				totalReward: 0
			});
		}

		let totalReward = 0;
		const currentTime = new Date();

		console.log(`[CHEAT] Completing jobs at timestamp: ${currentTime.toISOString()}`);

		// Log each job being completed
		employeesWithActiveJobs.forEach(({ employee, activeJob, route, endAddress }) => {
			console.log(
				`[CHEAT] Active job ${activeJob.id} for employee ${employee.name} (${employee.id})`
			);
			console.log(`[CHEAT]   - Route: ${route.id}, Reward: €${route.reward}`);
			console.log(
				`[CHEAT]   - Job start: ${activeJob.startTime ? new Date(activeJob.startTime).toISOString() : 'null'}`
			);
			console.log(
				`[CHEAT]   - End address: ${endAddress.street} ${endAddress.houseNumber}, ${endAddress.city}`
			);
		});

		// Calculate current money before transaction for return value
		const currentMoney =
			typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money;

		// Process all active jobs in a transaction (force complete them)
		await db.transaction(async (tx) => {
			for (const { employee, activeJob, route, endAddress } of employeesWithActiveJobs) {
				console.log(`[CHEAT] Processing active job ${activeJob.id} for employee ${employee.id}`);

				// Calculate reward - convert string to number if needed
				const routeReward =
					typeof route.reward === 'string' ? parseFloat(route.reward) : route.reward;
				totalReward += routeReward;

				// Update employee location to job completion location
				console.log(`[CHEAT] Updating employee ${employee.id} location to job completion address`);
				await tx
					.update(employees)
					.set({
						location: JSON.stringify({
							id: endAddress.id,
							lat: endAddress.lat,
							lon: endAddress.lon,
							street: endAddress.street,
							houseNumber: endAddress.houseNumber,
							city: endAddress.city,
							postcode: endAddress.postcode
						})
					})
					.where(eq(employees.id, employee.id));

				// Mark the active job as completed
				console.log(`[CHEAT] Marking active job ${activeJob.id} as completed`);
				await tx
					.update(activeJobs)
					.set({ endTime: currentTime })
					.where(eq(activeJobs.id, activeJob.id));

				console.log(`[CHEAT] Successfully processed active job ${activeJob.id}`);
			}

			// Update game state with total rewards - convert string to number if needed
			const newMoney = currentMoney + totalReward;

			console.log(`[CHEAT] Adding €${totalReward} to game state ${gameStateId}`);
			await tx
				.update(gameStates)
				.set({ money: newMoney.toString() })
				.where(eq(gameStates.id, gameStateId));

			console.log(`[CHEAT] Updated game state money from €${gameState.money} to €${newMoney}`);
		});

		console.log(
			`[CHEAT] Force completed ${employeesWithActiveJobs.length} active jobs for game ${gameStateId}, total reward: ${totalReward}`
		);

		return json({
			success: true,
			message: `Instantly completed ${employeesWithActiveJobs.length} active jobs`,
			completedRoutes: employeesWithActiveJobs.length,
			totalReward: totalReward,
			newBalance: currentMoney + totalReward
		});
	} catch (err) {
		console.error('Error completing routes via cheat:', err);
		return error(500, 'Failed to complete routes');
	}
};
