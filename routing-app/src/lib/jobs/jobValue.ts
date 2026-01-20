import { generate } from '$lib/rng/deterministicRng';
import type { GameState } from '$lib/server/db/schema';

/**
 * Compute random value using log-based formula
 * Formula: -log(1 - random) * randomFactorMax
 * This creates a distribution where small values are more common but large values are possible
 * 
 * @param seed - Game state seed
 * @param placeId - Place ID (used as datum for RNG)
 * @param randomFactorMax - Maximum random factor multiplier from config
 * @returns Random value multiplier
 */
export function computeRandomValue(seed: number, placeId: number, randomFactorMax: number): number {
	// Use a different datum than other functions to avoid correlation
	const datum = placeId * 1000 + 2; // Offset to ensure different random sequence
	
	// Generate random value between 0 and 1 (exclusive of 1)
	const random = generate(seed, datum);
	
	// Avoid log(0) by ensuring random is never exactly 1
	const safeRandom = Math.min(random, 0.999999);
	
	// Apply log-based formula: -log(1 - random) * randomFactorMax
	const randomValue = -Math.log(1 - safeRandom) * randomFactorMax;
	
	return randomValue;
}

/**
 * Get upgrade multiplier from game state
 * Currently returns 1.0 as a placeholder for future upgrade system integration
 * 
 * @param gameState - Current game state
 * @returns Upgrade multiplier (currently always 1.0)
 */
export function getUpgradeMultiplier(gameState: GameState): number {
	// TODO: Implement upgrade multiplier logic based on gameState.upgradeEffects
	// For now, return 1.0 as placeholder
	return 1.0;
}

/**
 * Compute job value using the formula:
 * good_value * max(vehicle_capacity, supply_amount) * random_value * upgrade_multiplier
 * 
 * @param goodValuePerKg - Value per kg of the good
 * @param supplyAmount - Supply amount in kg
 * @param vehicleCapacity - Vehicle capacity in kg
 * @param randomValue - Random value multiplier (from computeRandomValue)
 * @param upgradeMultiplier - Upgrade multiplier (from getUpgradeMultiplier)
 * @returns Job value in euros
 */
export function computeJobValue(
	goodValuePerKg: number,
	supplyAmount: number,
	vehicleCapacity: number,
	randomValue: number,
	upgradeMultiplier: number
): number {
	// Use max of vehicle capacity and supply amount
	const effectiveAmount = Math.max(vehicleCapacity, supplyAmount);
	
	// Calculate base value: good_value * effective_amount
	const baseValue = goodValuePerKg * effectiveAmount;
	
	// Apply multipliers
	const finalValue = baseValue * randomValue * upgradeMultiplier;
	
	return Math.round(finalValue * 100) / 100; // Round to 2 decimal places
}

/**
 * Compute complete job value from all inputs
 * Convenience function that combines all the calculation steps
 * 
 * @param goodValuePerKg - Value per kg of the good
 * @param supplyAmount - Supply amount in kg
 * @param vehicleCapacity - Vehicle capacity in kg
 * @param seed - Game state seed
 * @param placeId - Place ID (for deterministic RNG)
 * @param gameState - Current game state
 * @param randomFactorMax - Maximum random factor multiplier from config
 * @returns Job value in euros
 */
export function computeCompleteJobValue(
	goodValuePerKg: number,
	supplyAmount: number,
	vehicleCapacity: number,
	seed: number,
	placeId: number,
	gameState: GameState,
	randomFactorMax: number
): number {
	const randomValue = computeRandomValue(seed, placeId, randomFactorMax);
	const upgradeMultiplier = getUpgradeMultiplier(gameState);
	
	return computeJobValue(
		goodValuePerKg,
		supplyAmount,
		vehicleCapacity,
		randomValue,
		upgradeMultiplier
	);
}
