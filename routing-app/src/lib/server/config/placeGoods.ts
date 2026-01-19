import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import type { PlaceGoodsConfig, PlaceCategoryGoods, PlaceGood } from '$lib/config/placeGoodsTypes';

/**
 * Get the directory of the current file (for resolving config path)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve config path relative to the routing-app root
 */
const configPath = join(__dirname, '../../../../config', 'place_goods.yaml');

/**
 * Tolerance for floating point comparison (0.001 = 0.1%)
 */
const FRACTION_TOLERANCE = 0.001;

/**
 * Check if two numbers are approximately equal within tolerance
 */
function approximatelyEqual(a: number, b: number, tolerance: number = FRACTION_TOLERANCE): boolean {
	return Math.abs(a - b) < tolerance;
}

/**
 * Sum fractions in an array of goods
 */
function sumGoodFractions(goods: PlaceGood[]): number {
	return goods.reduce((sum, good) => sum + good.fraction, 0);
}

/**
 * Loads and validates the place goods configuration from config/place_goods.yaml
 */
function loadPlaceGoodsConfig(): PlaceGoodsConfig {
	try {
		const fileContents = readFileSync(configPath, 'utf-8');
		const config = load(fileContents) as PlaceGoodsConfig;

		// Validate config structure
		validatePlaceGoodsConfig(config);

		return config;
	} catch (error) {
		if (error instanceof Error) {
			if ('code' in error && error.code === 'ENOENT') {
				throw new Error(
					`Configuration file not found: ${configPath}\n` +
						'Please create config/place_goods.yaml in the routing-app root directory.'
				);
			}
			throw new Error(`Failed to load place goods configuration: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Validates the place goods configuration structure and values
 */
function validatePlaceGoodsConfig(config: PlaceGoodsConfig): void {
	const errors: string[] = [];

	// Validate top-level structure
	if (!config.categories || !Array.isArray(config.categories)) {
		errors.push('config must have a "categories" array');
		return; // Can't continue validation without categories
	}

	if (config.categories.length === 0) {
		errors.push('categories array must not be empty');
		return; // Can't continue validation without categories
	}

	// Validate each category
	config.categories.forEach((category: PlaceCategoryGoods, index: number) => {
		const categoryPrefix = `categories[${index}]`;

		// Validate name
		if (!category.name || typeof category.name !== 'string') {
			errors.push(`${categoryPrefix}.name must be a non-empty string`);
		}

		// Validate supply_fraction
		if (typeof category.supply_fraction !== 'number') {
			errors.push(`${categoryPrefix}.supply_fraction must be a number`);
		} else if (category.supply_fraction < 0 || category.supply_fraction > 1) {
			errors.push(`${categoryPrefix}.supply_fraction must be between 0 and 1`);
		}

		// Validate demand_fraction
		if (typeof category.demand_fraction !== 'number') {
			errors.push(`${categoryPrefix}.demand_fraction must be a number`);
		} else if (category.demand_fraction < 0 || category.demand_fraction > 1) {
			errors.push(`${categoryPrefix}.demand_fraction must be between 0 and 1`);
		}

		// Validate that supply_fraction + demand_fraction ≈ 1.0
		if (
			typeof category.supply_fraction === 'number' &&
			typeof category.demand_fraction === 'number'
		) {
			const total = category.supply_fraction + category.demand_fraction;
			if (!approximatelyEqual(total, 1.0)) {
				errors.push(
					`${categoryPrefix}: supply_fraction (${category.supply_fraction}) + demand_fraction (${category.demand_fraction}) = ${total}, expected 1.0`
				);
			}
		}

		// Validate supply array
		if (!Array.isArray(category.supply)) {
			errors.push(`${categoryPrefix}.supply must be an array`);
		} else {
			if (category.supply.length === 0) {
				errors.push(`${categoryPrefix}.supply must not be empty`);
			} else {
				category.supply.forEach((good: PlaceGood, goodIndex: number) => {
					if (!good.good || typeof good.good !== 'string') {
						errors.push(`${categoryPrefix}.supply[${goodIndex}].good must be a non-empty string`);
					}
					if (typeof good.fraction !== 'number') {
						errors.push(`${categoryPrefix}.supply[${goodIndex}].fraction must be a number`);
					} else if (good.fraction < 0 || good.fraction > 1) {
						errors.push(`${categoryPrefix}.supply[${goodIndex}].fraction must be between 0 and 1`);
					}
				});

				// Validate that supply fractions sum to 1.0
				const supplySum = sumGoodFractions(category.supply);
				if (!approximatelyEqual(supplySum, 1.0)) {
					errors.push(
						`${categoryPrefix}.supply fractions sum to ${supplySum}, expected 1.0`
					);
				}
			}
		}

		// Validate demand array
		if (!Array.isArray(category.demand)) {
			errors.push(`${categoryPrefix}.demand must be an array`);
		} else {
			if (category.demand.length === 0) {
				errors.push(`${categoryPrefix}.demand must not be empty`);
			} else {
				category.demand.forEach((good: PlaceGood, goodIndex: number) => {
					if (!good.good || typeof good.good !== 'string') {
						errors.push(`${categoryPrefix}.demand[${goodIndex}].good must be a non-empty string`);
					}
					if (typeof good.fraction !== 'number') {
						errors.push(`${categoryPrefix}.demand[${goodIndex}].fraction must be a number`);
					} else if (good.fraction < 0 || good.fraction > 1) {
						errors.push(`${categoryPrefix}.demand[${goodIndex}].fraction must be between 0 and 1`);
					}
				});

				// Validate that demand fractions sum to 1.0
				const demandSum = sumGoodFractions(category.demand);
				if (!approximatelyEqual(demandSum, 1.0)) {
					errors.push(
						`${categoryPrefix}.demand fractions sum to ${demandSum}, expected 1.0`
					);
				}
			}
		}
	});

	if (errors.length > 0) {
		throw new Error(
			`Place goods configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
}

// Load config once at module initialization
let placeGoodsConfig: PlaceGoodsConfig;
try {
	placeGoodsConfig = loadPlaceGoodsConfig();
} catch (error) {
	console.error('Failed to load place goods configuration:', error);
	throw error;
}

/**
 * Exported config - use this throughout the server-side code
 */
export { placeGoodsConfig };
