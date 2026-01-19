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
	supply_fraction: number;
	demand_fraction: number;
	supply: PlaceGood[];
	demand: PlaceGood[];
}

export interface PlaceGoodsConfig {
	categories: PlaceCategoryGoods[];
}
