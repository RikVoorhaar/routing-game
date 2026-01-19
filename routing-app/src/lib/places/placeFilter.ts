import type { PlaceFilter } from '$lib/stores/placeFilter';
import type { PlaceFilterPredicate } from '$lib/map/placesLimiter';
import type { Place } from '$lib/stores/placesCache';
import type { GameState } from '$lib/server/db/schema';
import type { PlaceGoodsConfig } from '$lib/config/placeGoodsTypes';
import { selectPlaceGoods } from './placeGoodsSelection';

/**
 * Create a filter predicate for places based on the active place filter
 * 
 * @param filter - Active place filter (null = no filter)
 * @param gameState - Current game state (needed for seed)
 * @param placeGoodsConfig - Place goods configuration
 * @returns Filter predicate function
 */
export function createPlaceFilterPredicate(
	filter: PlaceFilter | null,
	gameState: GameState | null,
	placeGoodsConfig: PlaceGoodsConfig | null
): PlaceFilterPredicate<Place> {
	// No filter if any required data is missing
	if (!filter || !gameState || !placeGoodsConfig) {
		return () => true; // No filter - show all places
	}

	return (place: Place): boolean => {
		// Always show the selected place, even if it doesn't match the filter
		if (place.id === filter.selectedPlaceId) {
			return true;
		}

		// Get category goods for this place
		const categoryGoods = placeGoodsConfig.categories.find((cat) => cat.name === place.category);
		if (!categoryGoods) {
			return false; // No category config, exclude from filter
		}

		// Compute selected goods for this place
		const selectedGoods = selectPlaceGoods(gameState.seed, place.id, categoryGoods);

		// Check if this place matches the filter
		// We want places that match the target type (opposite of what selected place does)
		// and have the same good
		return selectedGoods.type === filter.targetType && selectedGoods.good === filter.selectedGood;
	};
}
