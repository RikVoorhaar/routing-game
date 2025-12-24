import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import type {
	GameConfig,
	UpgradesConfig,
	VehiclesConfig,
	UpgradeConfig,
	VehicleConfig
} from '$lib/config/types';

/**
 * Get the directory of the current file (for resolving config path)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve config path relative to the routing-app root
 */
const configPath = join(__dirname, '../../../..', 'config', 'game-config.yaml');
const upgradesConfigPath = join(__dirname, '../../../..', 'config', 'upgrades.yaml');
const vehiclesConfigPath = join(__dirname, '../../../..', 'config', 'vehicles.yaml');

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

	// Validate upgrades section
	if (!config.upgrades) {
		errors.push('upgrades section is required');
	} else {
		if (typeof config.upgrades.baseCost !== 'number' || config.upgrades.baseCost < 0) {
			errors.push('upgrades.baseCost must be a non-negative number');
		}
		if (typeof config.upgrades.costExponent !== 'number' || config.upgrades.costExponent <= 0) {
			errors.push('upgrades.costExponent must be a positive number');
		}
		if (!config.upgrades.effects) {
			errors.push('upgrades.effects section is required');
		}
	}

	// Validate vehicles section
	if (!config.vehicles || Object.keys(config.vehicles).length === 0) {
		errors.push('vehicles section is required and must not be empty');
	}

	// Validate licenses section
	if (!config.licenses || Object.keys(config.licenses).length === 0) {
		errors.push('licenses section is required and must not be empty');
	}

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
 * Loads and validates the upgrades configuration from config/upgrades.yaml
 */
function loadUpgradesConfig(): UpgradesConfig {
	try {
		const fileContents = readFileSync(upgradesConfigPath, 'utf-8');
		const config = load(fileContents) as UpgradesConfig;

		// Validate config structure
		validateUpgradesConfig(config);

		return config;
	} catch (error) {
		if (error instanceof Error) {
			if ('code' in error && error.code === 'ENOENT') {
				throw new Error(
					`Configuration file not found: ${upgradesConfigPath}\n` +
						'Please create config/upgrades.yaml in the routing-app root directory.'
				);
			}
			throw new Error(`Failed to load upgrades configuration: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Validates the upgrades configuration structure and values
 * Exported for testing purposes
 */
export function validateUpgradesConfig(config: UpgradesConfig): void {
	const errors: string[] = [];

	if (!config.upgrades || !Array.isArray(config.upgrades)) {
		errors.push('upgrades must be an array');
	} else {
		const upgradeIds = new Set<string>();
		config.upgrades.forEach((upgrade: UpgradeConfig, index: number) => {
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

			if (upgrade.effect !== 'multiply' && upgrade.effect !== 'increment') {
				errors.push(`upgrades[${index}].effect must be either 'multiply' or 'increment'`);
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
 * Loads and validates the vehicles configuration from config/vehicles.yaml
 */
function loadVehiclesConfig(): VehiclesConfig {
	try {
		const fileContents = readFileSync(vehiclesConfigPath, 'utf-8');
		const config = load(fileContents) as VehiclesConfig;

		// Validate config structure
		validateVehiclesConfig(config);

		return config;
	} catch (error) {
		if (error instanceof Error) {
			if ('code' in error && error.code === 'ENOENT') {
				throw new Error(
					`Configuration file not found: ${vehiclesConfigPath}\n` +
						'Please create config/vehicles.yaml in the routing-app root directory.'
				);
			}
			throw new Error(`Failed to load vehicles configuration: ${error.message}`);
		}
		throw error;
	}
}

/**
 * Validates the vehicles configuration structure and values
 * Exported for testing purposes
 */
export function validateVehiclesConfig(config: VehiclesConfig): void {
	const errors: string[] = [];

	if (!config.vehicles || !Array.isArray(config.vehicles)) {
		errors.push('vehicles must be an array');
	} else {
		const vehicleLevels = new Set<number>();
		config.vehicles.forEach((vehicle: VehicleConfig, index: number) => {
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
	vehiclesConfig: VehiclesConfig,
	upgradesConfig: UpgradesConfig
): void {
	const errors: string[] = [];
	const vehicleLevels = vehiclesConfig.vehicles.map((v) => v.level).filter((level) => level > 0);
	const maxVehicleLevel = Math.max(...vehicleLevels, 0);

	// Find all upgrades that increment vehicleLevelMax
	const vehicleUnlockUpgrades = upgradesConfig.upgrades.filter(
		(upgrade) =>
			upgrade.effect === 'increment' &&
			upgrade.effectArguments.name === 'vehicleLevelMax' &&
			upgrade.effectArguments.amount === 1
	);

	// We need at least as many vehicle unlock upgrades as there are vehicle levels > 0
	// Each upgrade increments vehicleLevelMax by 1, so N upgrades unlock levels 1 through N
	if (vehicleUnlockUpgrades.length < maxVehicleLevel) {
		errors.push(
			`Need at least ${maxVehicleLevel} vehicle unlock upgrades (incrementing vehicleLevelMax), but found ${vehicleUnlockUpgrades.length}`
		);
	}

	// Check that vehicle level 0 exists (it should be unlocked by default)
	const hasLevelZero = vehiclesConfig.vehicles.some((v) => v.level === 0);
	if (!hasLevelZero) {
		errors.push('Vehicle level 0 must exist (unlocked by default)');
	}

	if (errors.length > 0) {
		throw new Error(
			`Vehicle-upgrade relationship validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
		);
	}
}

// Load configs once at module initialization
let upgradesConfig: UpgradesConfig;
let vehiclesConfig: VehiclesConfig;

try {
	upgradesConfig = loadUpgradesConfig();
	vehiclesConfig = loadVehiclesConfig();
	// Validate relationship between vehicles and upgrades
	validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig);
} catch (error) {
	console.error('Failed to load upgrades/vehicles configuration:', error);
	throw error;
}

/**
 * Exported config store - use this throughout the server-side code
 */
export { config, upgradesConfig, vehiclesConfig };
// Re-export types from shared location for backward compatibility
export type { GameConfig, UpgradesConfig, VehiclesConfig } from '$lib/config/types';
