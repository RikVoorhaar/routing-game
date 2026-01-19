import { generate } from '$lib/rng/deterministicRng';
import type { PlaceCategoryGoods } from '$lib/config/placeGoodsTypes';

/**
 * Select supply/demand and goods category for a place using deterministic RNG
 * 
 * Uses a single random number to determine both:
 * - Supply vs demand based on supply_fraction
 * - Goods category from the selected list using normalized value
 * 
 * @param seed - Game state seed
 * @param placeId - Place ID (used as datum for RNG)
 * @param categoryGoods - Place category goods configuration
 * @returns Selected goods type and category
 */
export function selectPlaceGoods(
	seed: number,
	placeId: number,
	categoryGoods: PlaceCategoryGoods
): { type: 'supply' | 'demand'; good: string } {
	// Generate single random number
	const r = generate(seed, placeId);

	// Determine supply vs demand based on supply_fraction
	const isSupply = r < categoryGoods.supply_fraction;

	// Get the normalized value for goods selection
	// If supply: divide by supply_fraction to get [0, 1) range
	// If demand: subtract supply_fraction and divide by demand_fraction to get [0, 1) range
	const goodsValue = isSupply
		? r / categoryGoods.supply_fraction
		: (r - categoryGoods.supply_fraction) / categoryGoods.demand_fraction;

	const goodsList = isSupply ? categoryGoods.supply : categoryGoods.demand;

	// Use weighted random selection based on cumulative fractions
	let cumulative = 0;
	for (const good of goodsList) {
		cumulative += good.fraction;
		if (goodsValue < cumulative) {
			return { type: isSupply ? 'supply' : 'demand', good: good.good };
		}
	}

	// Fallback to last item (shouldn't happen if fractions sum to 1.0)
	return { type: isSupply ? 'supply' : 'demand', good: goodsList[goodsList.length - 1].good };
}
