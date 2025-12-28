import { browser } from '$app/environment';

// Browser-side logger (simple console wrapper)
class BrowserLogger {
	private level: number;

	constructor() {
		const debugEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('debug-logs') === 'true';
		this.level = debugEnabled ? 4 : import.meta.env.DEV ? 3 : 1;
	}

	private shouldLog(level: number): boolean {
		return level <= this.level;
	}

	error(...args: unknown[]): void {
		if (this.shouldLog(1)) console.error(...args);
	}

	warn(...args: unknown[]): void {
		if (this.shouldLog(2)) console.warn(...args);
	}

	info(...args: unknown[]): void {
		if (this.shouldLog(3)) console.info(...args);
	}

	debug(...args: unknown[]): void {
		if (this.shouldLog(4)) console.debug(...args);
	}

	trace(...args: unknown[]): void {
		if (this.shouldLog(5)) console.trace(...args);
	}

	withTag(tag: string): BrowserLogger {
		const tagged = new BrowserLogger();
		tagged.level = this.level;
		const originalError = tagged.error.bind(tagged);
		const originalWarn = tagged.warn.bind(tagged);
		const originalInfo = tagged.info.bind(tagged);
		const originalDebug = tagged.debug.bind(tagged);
		const originalTrace = tagged.trace.bind(tagged);

		tagged.error = (...args: unknown[]) => originalError(`[${tag}]`, ...args);
		tagged.warn = (...args: unknown[]) => originalWarn(`[${tag}]`, ...args);
		tagged.info = (...args: unknown[]) => originalInfo(`[${tag}]`, ...args);
		tagged.debug = (...args: unknown[]) => originalDebug(`[${tag}]`, ...args);
		tagged.trace = (...args: unknown[]) => originalTrace(`[${tag}]`, ...args);

		return tagged;
	}

	setLevel(level: number): void {
		this.level = level;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('debug-logs', level >= 4 ? 'true' : 'false');
		}
	}

	getLevel(): number {
		return this.level;
	}
}

// Server-side logger - dynamically imported only server-side
let serverLog: typeof import('$lib/server/logging/serverLogger')['serverLog'] | null = null;

// Initialize server logger (only runs server-side)
if (!browser) {
	try {
		const serverLoggerModule = await import('$lib/server/logging/serverLogger');
		serverLog = serverLoggerModule.serverLog;
	} catch (e) {
		console.warn('Failed to load server logger:', e);
	}
}

// Create logger based on environment
const logger = browser ? new BrowserLogger() : (serverLog ?? new BrowserLogger());

// Export the logger API
export const log = logger as {
	error: (objOrMsg: unknown, ...args: unknown[]) => void;
	warn: (objOrMsg: unknown, ...args: unknown[]) => void;
	info: (objOrMsg: unknown, ...args: unknown[]) => void;
	debug: (objOrMsg: unknown, ...args: unknown[]) => void;
	trace: (objOrMsg: unknown, ...args: unknown[]) => void;
	routes: { error: typeof log.error; warn: typeof log.warn; info: typeof log.info; debug: typeof log.debug; trace: typeof log.trace };
	map: { error: typeof log.error; warn: typeof log.warn; info: typeof log.info; debug: typeof log.debug; trace: typeof log.trace };
	api: { error: typeof log.error; warn: typeof log.warn; info: typeof log.info; debug: typeof log.debug; trace: typeof log.trace };
	db: { error: typeof log.error; warn: typeof log.warn; info: typeof log.info; debug: typeof log.debug; trace: typeof log.trace };
	auth: { error: typeof log.error; warn: typeof log.warn; info: typeof log.info; debug: typeof log.debug; trace: typeof log.trace };
	game: { error: typeof log.error; warn: typeof log.warn; info: typeof log.info; debug: typeof log.debug; trace: typeof log.trace };
	setLevel: (level: number) => void;
	enableDebug: () => void;
	disableDebug: () => void;
	getLevel: () => number;
};

// Add convenience methods
log.enableDebug = () => log.setLevel(4);
log.disableDebug = () => log.setLevel(browser ? (import.meta.env.DEV ? 3 : 1) : 2);
