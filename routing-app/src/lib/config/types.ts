import { JobCategory } from '$lib/jobs/jobCategories';

/**
 * Type definitions for game configuration
 * These types match the structure of game-config.yaml
 * This file is shared between server and client code
 */

/**
 * Level requirements for upgrades
 * Can specify total level requirement and/or category-specific requirements
 */
export interface LevelRequirements {
	total?: number;
	[key: string]: number | undefined; // For category-specific requirements
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
	upgrades: {
		baseCost: number;
		costExponent: number;
		effects: {
			GROCERIES: {
				distanceEarningsPerLevel: number;
			};
			PACKAGES: {
				nodeToAddressTimeReductionPerLevel: number;
			};
			FOOD: {
				timeEarningsPerLevel: number;
			};
			FURNITURE: {
				capacityPerLevel: number;
			};
			PEOPLE: {
				xpGainPerLevel: number;
			};
			FRAGILE_GOODS: {
				maxSpeedPerLevel: number;
			};
			CONSTRUCTION: {
				maxJobCapacityPerLevel: number;
			};
			LIQUIDS: {
				routeTimeReductionPerLevel: number;
			};
			TOXIC_GOODS: {
				upgradeCostReductionPerLevel: number;
			};
		};
	};
	vehicles: Record<
		string,
		{
			baseCost: number;
			capacity: number;
			maxSpeed: number;
		}
	>;
	licenses: Record<
		string,
		{
			minDrivingLevel: number;
			cost: number;
		}
	>;
	dev: {
		speedMultiplier: number;
		xpMultiplier: number;
		moneyMultiplier: number;
	};
}
