import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import type { GameConfig, UpgradeConfig, VehicleConfig } from '$lib/config/types';
import { UPGRADE_DEFINITIONS } from '$lib/upgrades/upgradeDefinitions';
import { VEHICLE_DEFINITIONS } from '$lib/vehicles/vehicleDefinitions';

/**
 * Get the directory of the current file (for resolving config path)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve config path relative to the routing-app root
 */
const configPath = join(__dirname, '../../../..', 'config', 'game-config.yaml');

/**
 * Loads and validates the game configuration from config/game-config.yaml
 */
function loadConfig(): GameConfig {
	try {
		const fileContents = readFileSync(configPath, 'utf-8');
		const config = load(fileContents) as GameConfig;

		// Validate config structure
		validateConfig(config);

		return config;
	} catch (error) {
		if (error instanceof Error) {
			if ('code' in error && error.code === 'ENOENT') {
				throw new Error(
					`Configuration file not found: ${configPath}\n` +
						'Please create config/game-config.yaml in the routing-app root directory.'
				);
			}
			throw new Error(`Failed to load configuration: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Validates the configuration structure and values
 */
function validateConfig(config: GameConfig): void {
	const errors: string[] = [];

	// Validate game section
	if (!config.game || typeof config.game.startingMoney !== 'number') {
		errors.push('game.startingMoney must be a number');
	}
	if (config.game.startingMoney < 0) {
		errors.push('game.startingMoney must be >= 0');
	}

	// Validate employees section
	if (!config.employees?.hiring) {
		errors.push('employees.hiring section is required');
	} else {
		if (
			typeof config.employees.hiring.baseCost !== 'number' ||
			config.employees.hiring.baseCost < 0
		) {
			errors.push('employees.hiring.baseCost must be a non-negative number');
		}
		if (
			typeof config.employees.hiring.exponent !== 'number' ||
			config.employees.hiring.exponent < 0
		) {
			errors.push('employees.hiring.exponent must be a non-negative number');
		}
		if (typeof config.employees.hiring.firstEmployeeFree !== 'boolean') {
			errors.push('employees.hiring.firstEmployeeFree must be a boolean');
		}
	}

	// Validate XP section
	if (!config.xp) {
		errors.push('xp section is required');
	} else {
		if (typeof config.xp.driving?.perSecond !== 'number' || config.xp.driving.perSecond < 0) {
			errors.push('xp.driving.perSecond must be a non-negative number');
		}
		if (typeof config.xp.category?.perEuro !== 'number' || config.xp.category.perEuro < 0) {
			errors.push('xp.category.perEuro must be a non-negative number');
		}
	}

	// Validate jobs section
	if (!config.jobs) {
		errors.push('jobs section is required');
	} else {
		if (!config.jobs.value) {
			errors.push('jobs.value section is required');
		} else {
			if (
				typeof config.jobs.value.distanceFactor !== 'number' ||
				config.jobs.value.distanceFactor < 0
			) {
				errors.push('jobs.value.distanceFactor must be a non-negative number');
			}
			if (typeof config.jobs.value.timeFactor !== 'number' || config.jobs.value.timeFactor < 0) {
				errors.push('jobs.value.timeFactor must be a non-negative number');
			}
			if (
				typeof config.jobs.value.tierMultiplier !== 'number' ||
				config.jobs.value.tierMultiplier <= 0
			) {
				errors.push('jobs.value.tierMultiplier must be a positive number');
			}
			if (
				typeof config.jobs.value.randomFactorMax !== 'number' ||
				config.jobs.value.randomFactorMax <= 0
			) {
				errors.push('jobs.value.randomFactorMax must be a positive number');
			}
		}

		if (!config.jobs.generation) {
			errors.push('jobs.generation section is required');
		} else {
			if (
				typeof config.jobs.generation.maxTier !== 'number' ||
				config.jobs.generation.maxTier < 1
			) {
				errors.push('jobs.generation.maxTier must be >= 1');
			}
			if (
				typeof config.jobs.generation.maxJobsPerTile !== 'number' ||
				config.jobs.generation.maxJobsPerTile < 1
			) {
				errors.push('jobs.generation.maxJobsPerTile must be >= 1');
			}
			if (
				typeof config.jobs.generation.minTileLevel !== 'number' ||
				config.jobs.generation.minTileLevel < 0
			) {
				errors.push('jobs.generation.minTileLevel must be >= 0');
			}
		}

		if (!config.jobs.categories) {
			errors.push('jobs.categories section is required');
		}
	}

	// Note: vehicles, licenses, and upgrades sections removed - these are now defined in TypeScript code
	// Licenses are also defined in TypeScript code (src/lib/upgrades/vehicles.ts)

	// Validate dev section
	if (!config.dev) {
		errors.push('dev section is required');
	} else {
		if (typeof config.dev.speedMultiplier !== 'number' || config.dev.speedMultiplier <= 0) {
			errors.push('dev.speedMultiplier must be a positive number');
		}
		if (typeof config.dev.xpMultiplier !== 'number' || config.dev.xpMultiplier <= 0) {
			errors.push('dev.xpMultiplier must be a positive number');
		}
		if (typeof config.dev.moneyMultiplier !== 'number' || config.dev.moneyMultiplier <= 0) {
			errors.push('dev.moneyMultiplier must be a positive number');
		}
	}

	if (errors.length > 0) {
		throw new Error(
			`Configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
}

// Load config once at module initialization
let config: GameConfig;
try {
	config = loadConfig();
} catch (error) {
	console.error('Failed to load game configuration:', error);
	throw error;
}

/**
 * Validates the upgrades definitions structure and values
 * Exported for testing purposes
 */
export function validateUpgradesConfig(upgrades: UpgradeConfig[]): void {
	const errors: string[] = [];

	if (!Array.isArray(upgrades)) {
		errors.push('upgrades must be an array');
	} else {
		const upgradeIds = new Set<string>();
		upgrades.forEach((upgrade: UpgradeConfig, index: number) => {
			if (!upgrade.id || typeof upgrade.id !== 'string') {
				errors.push(`upgrades[${index}].id must be a non-empty string`);
			} else if (upgradeIds.has(upgrade.id)) {
				errors.push(`Duplicate upgrade ID: ${upgrade.id}`);
			} else {
				upgradeIds.add(upgrade.id);
			}

			if (!upgrade.name || typeof upgrade.name !== 'string') {
				errors.push(`upgrades[${index}].name must be a non-empty string`);
			}

			if (!Array.isArray(upgrade.upgradeRequirements)) {
				errors.push(`upgrades[${index}].upgradeRequirements must be an array`);
			}

			if (!upgrade.levelRequirements || typeof upgrade.levelRequirements !== 'object') {
				errors.push(`upgrades[${index}].levelRequirements must be an object`);
			}

			if (!upgrade.description || typeof upgrade.description !== 'string') {
				errors.push(`upgrades[${index}].description must be a non-empty string`);
			}

			if (typeof upgrade.cost !== 'number' || upgrade.cost < 0) {
				errors.push(`upgrades[${index}].cost must be a non-negative number`);
			}

			if (
				upgrade.effect !== 'multiply' &&
				upgrade.effect !== 'increment' &&
				upgrade.effect !== 'set'
			) {
				errors.push(`upgrades[${index}].effect must be either 'multiply', 'increment', or 'set'`);
			}

			if (
				!upgrade.effectArguments ||
				typeof upgrade.effectArguments.name !== 'string' ||
				typeof upgrade.effectArguments.amount !== 'number'
			) {
				errors.push(
					`upgrades[${index}].effectArguments must be an object with 'name' (string) and 'amount' (number)`
				);
			}
		});
	}

	if (errors.length > 0) {
		throw new Error(
			`Upgrades configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
}

/**
 * Validates the vehicle definitions structure and values
 * Exported for testing purposes
 */
export function validateVehiclesConfig(vehicles: VehicleConfig[]): void {
	const errors: string[] = [];

	if (!Array.isArray(vehicles)) {
		errors.push('vehicles must be an array');
	} else {
		const vehicleLevels = new Set<number>();
		vehicles.forEach((vehicle: VehicleConfig, index: number) => {
			if (typeof vehicle.level !== 'number' || vehicle.level < 0) {
				errors.push(`vehicles[${index}].level must be a non-negative number`);
			} else if (vehicleLevels.has(vehicle.level)) {
				errors.push(`Duplicate vehicle level: ${vehicle.level}`);
			} else {
				vehicleLevels.add(vehicle.level);
			}

			if (!vehicle.name || typeof vehicle.name !== 'string') {
				errors.push(`vehicles[${index}].name must be a non-empty string`);
			}

			if (typeof vehicle.capacity !== 'number' || vehicle.capacity <= 0) {
				errors.push(`vehicles[${index}].capacity must be a positive number`);
			}

			if (typeof vehicle.roadSpeed !== 'number' || vehicle.roadSpeed <= 0) {
				errors.push(`vehicles[${index}].roadSpeed must be a positive number`);
			}

			if (typeof vehicle.tier !== 'number' || vehicle.tier < 1) {
				errors.push(`vehicles[${index}].tier must be >= 1`);
			}
		});
	}

	if (errors.length > 0) {
		throw new Error(
			`Vehicles configuration validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
}

/**
 * Validates that each vehicle level (except 0) has a corresponding upgrade
 * This checks that there are enough vehicle unlock upgrades to cover all vehicle levels
 * Exported for testing purposes
 */
export function validateVehicleUpgradeRelationship(
	vehicles: VehicleConfig[],
	upgrades: UpgradeConfig[]
): void {
	const errors: string[] = [];
	const vehicleLevels = vehicles.map((v) => v.level).filter((level) => level > 0);
	const maxVehicleLevel = Math.max(...vehicleLevels, 0);

	// Find all upgrades that set vehicleLevelMax (using 'set' effect)
	const vehicleUnlockUpgrades = upgrades.filter(
		(upgrade) =>
			upgrade.effect === 'set' &&
			upgrade.effectArguments.name === 'vehicleLevelMax'
	);

	// We need at least as many vehicle unlock upgrades as there are vehicle levels
	// Each upgrade sets vehicleLevelMax to a specific level
	if (vehicleUnlockUpgrades.length < maxVehicleLevel + 1) {
		errors.push(
			`Need at least ${maxVehicleLevel + 1} vehicle unlock upgrades (setting vehicleLevelMax), but found ${vehicleUnlockUpgrades.length}`
		);
	}

	// Verify that all vehicle levels have corresponding unlock upgrades
	const unlockedLevels = new Set(
		vehicleUnlockUpgrades.map((upgrade) => upgrade.effectArguments.amount as number)
	);
	for (let level = 0; level <= maxVehicleLevel; level++) {
		if (!unlockedLevels.has(level)) {
			errors.push(`Missing vehicle unlock upgrade for level ${level}`);
		}
	}

	// Check that vehicle level 0 exists (it should be unlocked by default)
	const hasLevelZero = vehicles.some((v) => v.level === 0);
	if (!hasLevelZero) {
		errors.push('Vehicle level 0 must exist (unlocked by default)');
	}

	if (errors.length > 0) {
		throw new Error(
			`Vehicle-upgrade relationship validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
}

// Validate definitions on module load
try {
	validateUpgradesConfig(UPGRADE_DEFINITIONS);
	validateVehiclesConfig(VEHICLE_DEFINITIONS);
	// Validate relationship between vehicles and upgrades
	validateVehicleUpgradeRelationship(VEHICLE_DEFINITIONS, UPGRADE_DEFINITIONS);
} catch (error) {
	console.error('Failed to validate upgrade/vehicle definitions:', error);
	throw error;
}

/**
 * Exported config and definitions - use this throughout the server-side code
 * Note: Vehicle and upgrade definitions are imported directly from TypeScript code,
 * not loaded from YAML files
 */
export { config, UPGRADE_DEFINITIONS, VEHICLE_DEFINITIONS };
// Re-export types from shared location
export type { GameConfig } from '$lib/config/types';
