import { JobCategory } from '$lib/jobs/jobCategories';

/**
 * Type definitions for game configuration
 * These types match the structure of game-config.yaml
 * This file is shared between server and client code
 */

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

