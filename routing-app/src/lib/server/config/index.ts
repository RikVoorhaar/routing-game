import { readFileSync, watchFile, unwatchFile } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import type { GameConfig } from './types';

/**
 * Get the directory of the current file (for resolving config path)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve config path relative to the routing-app root
 */
const configPath = join(__dirname, '../../../..', 'game-config.yaml');

/**
 * Loads and validates the game configuration from game-config.yaml
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
						'Please create game-config.yaml in the routing-app root directory.'
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

// Load config - will be reloaded on file changes in dev mode
let config: GameConfig;
try {
	config = loadConfig();
} catch (error) {
	console.error('Failed to load game configuration:', error);
	throw error;
}

/**
 * Reloads the config from disk
 */
function reloadConfig(): void {
	try {
		const newConfig = loadConfig();
		config = newConfig;
		console.log('[Config] Reloaded game-config.yaml');
		
		// Invalidate Vite HMR if available
		if (import.meta.hot) {
			import.meta.hot.send('config:reload', { timestamp: Date.now() });
		}
	} catch (error) {
		console.error('[Config] Failed to reload configuration:', error);
		// Keep using the old config if reload fails
	}
}

// Set up file watching in development mode
if (import.meta.hot || process.env.NODE_ENV !== 'production') {
	// Watch the config file for changes
	watchFile(
		configPath,
		{ interval: 1000 }, // Check every second
		(curr, prev) => {
			// Only reload if the file was actually modified (not just accessed)
			if (curr.mtimeMs !== prev.mtimeMs) {
				reloadConfig();
			}
		}
	);

	// Clean up watcher on module unload (for HMR)
	if (import.meta.hot) {
		import.meta.hot.on('vite:beforeFullReload', () => {
			unwatchFile(configPath);
		});
	}
}

/**
 * Exported config store - use this throughout the server-side code
 * In dev mode, this will automatically reload when game-config.yaml changes
 */
export { config };
export type { GameConfig };
