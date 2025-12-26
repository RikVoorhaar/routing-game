import { VEHICLE_DEFINITIONS } from './vehicleDefinitions';
import type { VehicleConfig } from '$lib/config/types';
import type { GameState } from '$lib/server/db/schema';

/**
 * Get vehicle configuration for a specific level
 *
 * Parameters
 * ----------
 * level: number
 *     Vehicle level (0-based)
 *
 * Returns
 * -------
 * VehicleConfig | null
 *     Vehicle configuration, or null if level doesn't exist
 */
export function getVehicleConfig(level: number): VehicleConfig | null {
	return VEHICLE_DEFINITIONS.find((v) => v.level === level) || null;
}

/**
 * Get the maximum vehicle level unlocked via global upgrades
 *
 * Parameters
 * ----------
 * gameState: GameState
 *     Current game state
 *
 * Returns
 * -------
 * number
 *     Maximum vehicle level available (defaults to 0 if not set)
 */
export function getMaxVehicleLevel(gameState: GameState): number {
	return gameState.upgradeEffects?.vehicleLevelMax ?? 0;
}

/**
 * Check if a vehicle level is unlocked
 *
 * Parameters
 * ----------
 * vehicleLevel: number
 *     Vehicle level to check
 * gameState: GameState
 *     Current game state
 *
 * Returns
 * -------
 * boolean
 *     True if vehicle level is unlocked
 */
export function isVehicleLevelUnlocked(vehicleLevel: number, gameState: GameState): boolean {
	const maxLevel = getMaxVehicleLevel(gameState);
	return vehicleLevel <= maxLevel;
}

/**
 * Get the next vehicle level available for upgrade
 *
 * Parameters
 * ----------
 * currentVehicleLevel: number
 *     Current vehicle level
 * gameState: GameState
 *     Current game state
 *
 * Returns
 * -------
 * number | null
 *     Next vehicle level, or null if max level reached
 */
export function getNextVehicleLevel(
	currentVehicleLevel: number,
	gameState: GameState
): number | null {
	const maxLevel = getMaxVehicleLevel(gameState);
	const nextLevel = currentVehicleLevel + 1;

	if (nextLevel > maxLevel) {
		return null; // Not unlocked yet
	}

	// Check if vehicle definition exists for next level
	const nextVehicle = getVehicleConfig(nextLevel);
	return nextVehicle ? nextLevel : null;
}

/**
 * Get vehicle upgrade cost from vehicle definition
 *
 * Parameters
 * ----------
 * vehicleLevel: number
 *     Target vehicle level
 *
 * Returns
 * -------
 * number
 *     Cost in euros, or 0 if vehicle not found
 */
export function getVehicleUpgradeCost(vehicleLevel: number): number {
	const vehicle = getVehicleConfig(vehicleLevel);
	return vehicle?.cost ?? 0;
}

