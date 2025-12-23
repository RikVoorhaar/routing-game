import { createConsola } from 'consola';
import { browser } from '$app/environment';

// Get log level from environment or use defaults
const getLogLevel = () => {
	if (browser) {
		// Browser: Check for debug flag in localStorage or use dev/prod defaults
		const debugEnabled = localStorage?.getItem('debug-logs') === 'true';
		return debugEnabled ? 4 : import.meta.env.DEV ? 3 : 1;
	} else {
		// Server: Check environment variables
		const envLevel = process.env.LOG_LEVEL;
		if (envLevel) return parseInt(envLevel, 10);

		const debugEnabled = process.env.ENABLE_DEBUG_LOGS === '1';
		return debugEnabled ? 4 : process.env.NODE_ENV === 'development' ? 3 : 2;
	}
};

// Create logger instance
const logger = createConsola({
	level: getLogLevel(),

	// Configure output format
	formatOptions: {
		colors: true,
		date: true,
		compact: !browser // More compact on server
	},

	// Add context for browser vs server
	defaults: {
		tag: browser ? 'client' : 'server'
	}
});

// Log levels:
// 0: silent
// 1: error
// 2: warn
// 3: info
// 4: debug
// 5: trace

export default logger;

// Convenience exports for common patterns
export const log = {
	error: logger.error.bind(logger),
	warn: logger.warn.bind(logger),
	info: logger.info.bind(logger),
	debug: logger.debug.bind(logger),
	trace: logger.trace.bind(logger),

	// Specialized loggers for different modules
	routes: logger.withTag('routes'),
	map: logger.withTag('map'),
	api: logger.withTag('api'),
	db: logger.withTag('db'),
	auth: logger.withTag('auth'),
	game: logger.withTag('game'),

	// Utility functions
	setLevel: (level: number) => {
		logger.level = level;
		if (browser) {
			localStorage?.setItem('debug-logs', level >= 4 ? 'true' : 'false');
		}
	},

	enableDebug: () => log.setLevel(4),
	disableDebug: () => log.setLevel(browser ? (import.meta.env.DEV ? 3 : 1) : 2),

	getLevel: () => logger.level
};
