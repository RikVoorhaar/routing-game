import { generate } from '$lib/rng/deterministicRng';
import type { PlaceCategoryGoods } from '$lib/config/placeGoodsTypes';

/**
 * Generate supply amount for a place using deterministic RNG
 * 
 * Uses the game state seed and place ID to generate a deterministic random value
 * Formula: base_supply_amount_kg * random_factor
 * Where random_factor is between 0.5 and 2.0
 * 
 * @param seed - Game state seed
 * @param placeId - Place ID (used as datum for RNG)
 * @param categoryConfig - Place category goods configuration
 * @returns Supply amount in kg
 */
export function generateSupplyAmount(
	seed: number,
	placeId: number,
	categoryConfig: PlaceCategoryGoods
): number {
	// Use a different datum than placeGoodsSelection to avoid correlation
	const datum = placeId * 1000 + 1; // Offset to ensure different random sequence
	
	// Generate random value between 0 and 1
	const random = generate(seed, datum);
	
	// Map to range [0.5, 2.0] for random factor
	const randomFactor = 0.5 + random * 1.5;
	
	// Get base supply amount (default to 100 if not specified)
	const baseAmount = categoryConfig.base_supply_amount_kg ?? 100;
	
	// Calculate final supply amount
	const supplyAmount = baseAmount * randomFactor;
	
	return Math.round(supplyAmount * 100) / 100; // Round to 2 decimal places
}
