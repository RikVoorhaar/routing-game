import { writable } from 'svelte/store';

/**
 * Place filter state - tracks which place was clicked and what we're filtering for
 */
export interface PlaceFilter {
	selectedPlaceId: number;
	selectedGood: string;
	filterType: 'supply' | 'demand'; // What the selected place does
	targetType: 'demand' | 'supply'; // What we're filtering for
}

/**
 * Store for active place filter
 * null = no filter active
 */
export const placeFilter = writable<PlaceFilter | null>(null);
