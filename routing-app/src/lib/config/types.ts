import { JobCategory } from '$lib/jobs/jobCategories';

/**
 * Type definitions for game configuration
 * These types match the structure of config/game-config.yaml
 * This file is shared between server and client code
 */

/**
 * Level requirements for upgrades
 * Can specify total level requirement and/or category-specific requirements
 * Category-specific requirements use JobCategory enum keys (e.g., "FURNITURE", "PEOPLE", "GROCERIES")
 */
export interface LevelRequirements {
	total?: number;
	GROCERIES?: number;
	PACKAGES?: number;
	FOOD?: number;
	FURNITURE?: number;
	PEOPLE?: number;
	FRAGILE_GOODS?: number;
	CONSTRUCTION?: number;
	LIQUIDS?: number;
	TOXIC_GOODS?: number;
}

/**
 * Upgrade effect type - either multiply or increment
 */
export type UpgradeEffectType = 'multiply' | 'increment';

/**
 * Arguments for upgrade effects
 */
export interface UpgradeEffectArguments {
	name: string;
	amount: number;
}

/**
 * Single upgrade configuration
 */
export interface UpgradeConfig {
	id: string;
	name: string;
	upgradeRequirements: string[];
	levelRequirements: LevelRequirements;
	description: string;
	cost: number;
	effect: UpgradeEffectType;
	effectArguments: UpgradeEffectArguments;
}

/**
 * Root upgrades configuration structure
 */
export interface UpgradesConfig {
	upgrades: UpgradeConfig[];
}

/**
 * Single vehicle configuration
 */
export interface VehicleConfig {
	level: number;
	name: string;
	capacity: number;
	roadSpeed: number;
	tier: number;
	cost: number; // Cost in euros to upgrade to this vehicle level
}

/**
 * Root vehicles configuration structure
 */
export interface VehiclesConfig {
	vehicles: VehicleConfig[];
}

export interface GameConfig {
	game: {
		startingMoney: number;
	};
	employees: {
		hiring: {
			baseCost: number;
			exponent: number;
			firstEmployeeFree: boolean;
		};
	};
	xp: {
		driving: {
			perSecond: number;
		};
		category: {
			perEuro: number;
		};
	};
	jobs: {
		value: {
			distanceFactor: number;
			timeFactor: number;
			tierMultiplier: number;
			randomFactorMax: number;
		};
		generation: {
			maxTier: number;
			maxJobsPerTile: number;
			minTileLevel: number;
		};
		categories: {
			multipliers: Record<string, number>;
			minTiers: Record<string, number>;
		};
	};
	dev: {
		speedMultiplier: number;
		xpMultiplier: number;
		moneyMultiplier: number;
	};
}
