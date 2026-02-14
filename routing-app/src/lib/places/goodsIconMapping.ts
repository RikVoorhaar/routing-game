/**
 * Mapping of goods types to Font Awesome icon names
 * Used for displaying icons on POIs in MapLibre
 */

export const GOODS_ICON_MAP: Record<string, string> = {
	people: 'fa-person',
	groceries: 'fa-basket-shopping',
	'food (hot)': 'fa-pizza-slice',
	electronics: 'fa-microchip',
	'consumer goods': 'fa-spray-can-sparkles',
	packages: 'fa-box-open',
	flowers: 'fa-seedling',
	'fuel (liquid)': 'fa-gas-pump',
	cars: 'fa-car-side',
	medicine: 'fa-capsules',
	'bulk food': 'fa-carrot',
	coal: 'fa-smog',
	ore: 'fa-gem',
	'quarried stuff': 'fa-pallet',
	'construction materials': 'fa-gears',
	chemicals: 'fa-flask',
	animals: 'fa-cow'
};

/**
 * Get Font Awesome icon name for a goods type
 * @param good - Goods type name
 * @returns Font Awesome icon name (e.g., 'fa-person') or null if not found
 */
export function getGoodsIconName(good: string): string | null {
	return GOODS_ICON_MAP[good] || null;
}
