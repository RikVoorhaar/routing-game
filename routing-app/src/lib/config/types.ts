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
 * Upgrade effect type - multiply, increment, or set
 */
export type UpgradeEffectType = 'multiply' | 'increment' | 'set';

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
	glyph?: string; // Optional emoji/glyph to display with the upgrade
}

/**
 * Single vehicle configuration
 */
export interface VehicleConfig {
	id: string; // Unique identifier for the vehicle (used for upgrade ID generation)
	level: number;
	name: string;
	capacity: number;
	roadSpeed: number;
	tier: number;
	purchaseCost: number; // Cost in euros for an employee to purchase this vehicle level
	unlockCost: number; // Cost in euros to unlock this vehicle globally (via upgrade)
	unlockLevelRequirement: number; // Minimum total level required to unlock this vehicle
	purchaseLevelRequirement: number; // Minimum employee level required to purchase this vehicle
}

export interface GameConfig {
	game: {
		startingMoney: number;
		seedRefreshHours: number;
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
			maxJobsPerTile: number;
			minTileLevel: number;
			temperature: number;
		};
		search: {
			radiusMeters: number;
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
