import type { Place } from '$lib/stores/placesCache';

/**
 * Filter predicate type for places
 * Generic type parameter allows extending Place with additional info in the future
 */
export type PlaceFilterPredicate<T = Place> = (place: T) => boolean;

/**
 * Filter and limit places
 *
 * Parameters
 * -----------
 * places: T[]
 *     Array of places to filter and limit
 * filter: PlaceFilterPredicate<T>
 *     Filter predicate function
 * limit: number
 *     Maximum number of places to return after filtering
 *
 * Returns
 * --------
 * T[]
 *     Filtered and limited array of places
 */
export function limitPlaces<T extends Place>(
	places: T[],
	filter: PlaceFilterPredicate<T>,
	limit: number
): T[] {
	// Apply filter first
	const filtered = places.filter(filter);

	// Then limit to specified count
	return filtered.slice(0, limit);
}
