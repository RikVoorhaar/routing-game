// Server-side logger wrapper - only imported server-side
import { getServerLogger, setServerLoggerLevel, getServerLoggerLevel } from './pinoLogger';
import type pino from 'pino';

const pinoLogger = getServerLogger();

// Create tagged loggers
function createTaggedLogger(tag: string) {
	return {
		error: (objOrMsg: unknown, ...args: unknown[]) => {
			if (typeof objOrMsg === 'object' && objOrMsg !== null) {
				pinoLogger.error({ ...(objOrMsg as Record<string, unknown>), tag }, ...args);
			} else {
				pinoLogger.error({ tag }, objOrMsg, ...args);
			}
		},
		warn: (objOrMsg: unknown, ...args: unknown[]) => {
			if (typeof objOrMsg === 'object' && objOrMsg !== null) {
				pinoLogger.warn({ ...(objOrMsg as Record<string, unknown>), tag }, ...args);
			} else {
				pinoLogger.warn({ tag }, objOrMsg, ...args);
			}
		},
		info: (objOrMsg: unknown, ...args: unknown[]) => {
			if (typeof objOrMsg === 'object' && objOrMsg !== null) {
				pinoLogger.info({ ...(objOrMsg as Record<string, unknown>), tag }, ...args);
			} else {
				pinoLogger.info({ tag }, objOrMsg, ...args);
			}
		},
		debug: (objOrMsg: unknown, ...args: unknown[]) => {
			if (typeof objOrMsg === 'object' && objOrMsg !== null) {
				pinoLogger.debug({ ...(objOrMsg as Record<string, unknown>), tag }, ...args);
			} else {
				pinoLogger.debug({ tag }, objOrMsg, ...args);
			}
		},
		trace: (objOrMsg: unknown, ...args: unknown[]) => {
			if (typeof objOrMsg === 'object' && objOrMsg !== null) {
				pinoLogger.trace({ ...(objOrMsg as Record<string, unknown>), tag }, ...args);
			} else {
				pinoLogger.trace({ tag }, objOrMsg, ...args);
			}
		}
	};
}

export const serverLog = {
	error: (objOrMsg: unknown, ...args: unknown[]) => {
		if (typeof objOrMsg === 'object' && objOrMsg !== null) {
			pinoLogger.error(objOrMsg as Record<string, unknown>, ...args);
		} else {
			pinoLogger.error(objOrMsg, ...args);
		}
	},
	warn: (objOrMsg: unknown, ...args: unknown[]) => {
		if (typeof objOrMsg === 'object' && objOrMsg !== null) {
			pinoLogger.warn(objOrMsg as Record<string, unknown>, ...args);
		} else {
			pinoLogger.warn(objOrMsg, ...args);
		}
	},
	info: (objOrMsg: unknown, ...args: unknown[]) => {
		if (typeof objOrMsg === 'object' && objOrMsg !== null) {
			pinoLogger.info(objOrMsg as Record<string, unknown>, ...args);
		} else {
			pinoLogger.info(objOrMsg, ...args);
		}
	},
	debug: (objOrMsg: unknown, ...args: unknown[]) => {
		if (typeof objOrMsg === 'object' && objOrMsg !== null) {
			pinoLogger.debug(objOrMsg as Record<string, unknown>, ...args);
		} else {
			pinoLogger.debug(objOrMsg, ...args);
		}
	},
	trace: (objOrMsg: unknown, ...args: unknown[]) => {
		if (typeof objOrMsg === 'object' && objOrMsg !== null) {
			pinoLogger.trace(objOrMsg as Record<string, unknown>, ...args);
		} else {
			pinoLogger.trace(objOrMsg, ...args);
		}
	},
	routes: createTaggedLogger('routes'),
	map: createTaggedLogger('map'),
	api: createTaggedLogger('api'),
	db: createTaggedLogger('db'),
	auth: createTaggedLogger('auth'),
	game: createTaggedLogger('game'),
	setLevel: setServerLoggerLevel,
	getLevel: getServerLoggerLevel
};
