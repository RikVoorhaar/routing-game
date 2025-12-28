import pino from 'pino';
import { getRequestContext } from './requestContext';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Transform } from 'node:stream';

const require = createRequire(import.meta.url);
const rfs = require('rotating-file-stream');

// Map our log levels to Pino levels
// 0: silent, 1: error, 2: warn, 3: info, 4: debug, 5: trace
const LEVEL_MAP: Record<number, pino.Level> = {
	0: 'silent',
	1: 'error',
	2: 'warn',
	3: 'info',
	4: 'debug',
	5: 'trace'
};

function getPinoLevel(level: number): pino.Level {
	return LEVEL_MAP[level] ?? 'info';
}

/**
 * Creates a safe wrapper stream that validates JSON lines before writing.
 * This prevents corrupted JSON from being written (e.g., from accidental file edits,
 * rotation issues, or other corruption sources).
 *
 * Returns
 * --------
 * Transform
 *     A Transform stream that validates and passes through valid JSON lines
 */
function createSafeJsonStream(): Transform {
	let buffer = '';

	return new Transform({
		objectMode: false,
		transform(chunk: Buffer, encoding, callback) {
			// Append chunk to buffer
			buffer += chunk.toString('utf8');

			// Process complete lines (Pino writes one JSON object per line)
			const lines = buffer.split('\n');
			// Keep the last incomplete line in buffer
			buffer = lines.pop() || '';

			// Process each complete line
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					// Empty line, skip
					continue;
				}

				// Validate JSON before writing
				try {
					JSON.parse(trimmed);
					// Valid JSON, pass it through
					this.push(trimmed + '\n');
				} catch (error) {
					// Invalid JSON - log error but don't crash
					// This can happen from accidental edits, rotation issues, etc.
					console.error('[Logger] Skipping corrupted log entry:', trimmed.substring(0, 100));
				}
			}

			callback();
		},
		flush(callback) {
			// Process any remaining buffer on flush
			if (buffer.trim()) {
				try {
					JSON.parse(buffer.trim());
					this.push(buffer.trim() + '\n');
				} catch (error) {
					console.error(
						'[Logger] Skipping corrupted log entry on flush:',
						buffer.substring(0, 100)
					);
				}
			}
			callback();
		}
	});
}

function createServerLogger() {
	const isDev = process.env.NODE_ENV === 'development' || import.meta.env.DEV;
	const envLevel = process.env.LOG_LEVEL;
	const debugEnabled = process.env.ENABLE_DEBUG_LOGS === '1';

	// Determine log level
	let level: pino.Level = 'info';
	if (envLevel) {
		level = getPinoLevel(parseInt(envLevel, 10));
	} else if (debugEnabled) {
		level = 'debug';
	} else if (isDev) {
		level = 'info';
	} else {
		level = 'warn';
	}

	// Base logger config
	const baseConfig: pino.LoggerOptions = {
		level,
		// Mixin function to inject request context automatically
		mixin() {
			const ctx = getRequestContext();
			if (ctx) {
				return {
					request_id: ctx.requestId,
					user_id: ctx.userId,
					game_state_id: ctx.gameStateId,
					employee_id: ctx.employeeId,
					job_id: ctx.jobId
				};
			}
			return {};
		},
		// Redact sensitive fields
		redact: {
			paths: ['password', 'hashedPassword', 'token', 'secret', 'apiKey'],
			remove: true
		}
	};

	if (isDev) {
		// Development: pretty stdout + rotating file
		const logDir = join(process.cwd(), '.logs');
		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}

		// Create rotating file stream (10MB per file, keep 5 files)
		const rotatingStream = rfs.createStream('server.log', {
			path: logDir,
			size: '10M',
			maxFiles: 5,
			compress: 'gzip'
		});

		// Create a safe JSON validation wrapper to prevent corruption
		const safeJsonStream = createSafeJsonStream();

		// Pipe through validation before writing to rotating stream
		safeJsonStream.pipe(rotatingStream);

		// Handle errors on the safe stream
		safeJsonStream.on('error', (err: Error) => {
			console.error('[Logger] Safe JSON stream error:', err);
		});

		// Handle errors on the rotating stream
		rotatingStream.on('error', (err: Error) => {
			console.error('[Logger] Rotating file stream error:', err);
		});

		// Create multi-stream: pretty to stdout, validated JSON to file
		const streams: pino.StreamEntry[] = [
			// Pretty output to stdout
			{
				level,
				stream: pino.transport({
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'HH:MM:ss.l',
						ignore: 'pid,hostname'
					}
				})
			},
			// Validated JSON to rotating file
			{
				level,
				stream: safeJsonStream
			}
		];

		return pino(baseConfig, pino.multistream(streams));
	} else {
		// Production: JSON to stdout only
		return pino(baseConfig);
	}
}

// Create singleton logger instance
let serverLogger: pino.Logger | null = null;

export function getServerLogger(): pino.Logger {
	if (!serverLogger) {
		serverLogger = createServerLogger();
	}
	return serverLogger;
}

export function setServerLoggerLevel(level: number): void {
	const logger = getServerLogger();
	logger.level = getPinoLevel(level);
}

export function getServerLoggerLevel(): number {
	const logger = getServerLogger();
	const pinoLevel = logger.level;
	// Reverse map
	const levelMap: Record<string, number> = {
		silent: 0,
		error: 1,
		warn: 2,
		info: 3,
		debug: 4,
		trace: 5
	};
	return levelMap[pinoLevel] ?? 3;
}
