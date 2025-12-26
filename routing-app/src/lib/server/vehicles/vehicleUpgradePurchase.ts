import { db } from '$lib/server/db';
import { gameStates, employees } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { GameState, Employee } from '$lib/server/db/schema';
import {
	getNextVehicleLevel,
	isVehicleLevelUnlocked,
	getVehicleConfig,
	getVehicleUpgradeCost
} from '$lib/vehicles/vehicleUtils';

/**
 * Purchase vehicle upgrade for an employee
 *
 * Parameters
 * ----------
 * employeeId: string
 *     Employee ID
 * gameStateId: string
 *     Game state ID
 * userId: string
 *     User ID (for authorization)
 *
 * Returns
 * -------
 * Promise<{ employee: Employee; gameState: GameState }>
 *     Updated employee and game state
 *
 * Throws
 * ------
 * Error if employee not found, vehicle level not unlocked, insufficient funds, or max level reached
 */
export async function purchaseVehicleUpgrade(
	employeeId: string,
	gameStateId: string,
	userId: string
): Promise<{ employee: Employee; gameState: GameState }> {
	return await db.transaction(async (tx) => {
		// Lock game state and employee rows for update
		const [lockedGameState] = await tx
			.select()
			.from(gameStates)
			.where(and(eq(gameStates.id, gameStateId), eq(gameStates.userId, userId)))
			.for('update')
			.limit(1);

		if (!lockedGameState) {
			throw new Error('Game state not found or access denied');
		}

		const [employee] = await tx
			.select()
			.from(employees)
			.where(and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId)))
			.for('update')
			.limit(1);

		if (!employee) {
			throw new Error('Employee not found');
		}

		// Get next vehicle level
		const nextLevel = getNextVehicleLevel(employee.vehicleLevel, lockedGameState);
		if (nextLevel === null) {
			throw new Error('Maximum vehicle level reached or not unlocked');
		}

		// Verify vehicle level is unlocked
		if (!isVehicleLevelUnlocked(nextLevel, lockedGameState)) {
			throw new Error(`Vehicle level ${nextLevel} is not unlocked`);
		}

		// Get cost from vehicle definition
		const baseUpgradeCost = getVehicleUpgradeCost(nextLevel);
		if (baseUpgradeCost === 0) {
			throw new Error(`Vehicle level ${nextLevel} has no cost defined`);
		}

		// Apply upgrade discount if any
		const upgradeDiscount = lockedGameState.upgradeEffects?.upgradeDiscount ?? 0;
		const finalCost = Math.floor(baseUpgradeCost * (1 - upgradeDiscount));

		// Check sufficient money
		if (lockedGameState.money < finalCost) {
			throw new Error(
				`Insufficient funds. Required: ${finalCost}, Available: ${lockedGameState.money}`
			);
		}

		// Update employee vehicle level
		const [updatedEmployee] = await tx
			.update(employees)
			.set({ vehicleLevel: nextLevel })
			.where(eq(employees.id, employeeId))
			.returning();

		if (!updatedEmployee) {
			throw new Error('Failed to update employee');
		}

		// Deduct money from game state
		const [updatedGameState] = await tx
			.update(gameStates)
			.set({ money: lockedGameState.money - finalCost })
			.where(eq(gameStates.id, gameStateId))
			.returning();

		if (!updatedGameState) {
			throw new Error('Failed to update game state');
		}

		return {
			employee: updatedEmployee,
			gameState: updatedGameState
		};
	});
}
