/**
 * Type definitions for place goods configuration
 * These types match the structure of config/place_goods.yaml
 */

export interface PlaceGood {
	good: string;
	fraction: number;
}

export interface PlaceCategoryGoods {
	name: string;
	base_supply_amount_kg?: number;
	supply_fraction: number;
	demand_fraction: number;
	supply: PlaceGood[];
	demand: PlaceGood[];
}

export interface GoodValue {
	value_per_kg: number;
}

export interface PlaceGoodsConfig {
	goods?: Record<string, GoodValue>;
	categories: PlaceCategoryGoods[];
}
