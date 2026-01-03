#!/usr/bin/env tsx

// Load environment variables BEFORE any other imports
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from routing-app root (where package.json is)
// process.cwd() is routing-app when running via npm script
const envPath = resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Verify it loaded
if (!process.env.ROUTING_SERVER_URL) {
	console.error(`Error: ROUTING_SERVER_URL not found. Tried loading from: ${envPath}`);
	process.exit(1);
}

import { generateJobFromAddress, clearAllJobs } from '../lib/jobs/generateJobs';
import { db, client } from '../lib/server/db/standalone.js';
import { addresses, jobs } from '../lib/server/db/schema';
import type { Address } from '../lib/server/db/schema';
import { count, asc, isNull, sql, inArray } from 'drizzle-orm';
import { performance } from 'perf_hooks';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';
import {
	AggregatingProfiler,
	profiledAsync,
	profiledSync,
	setActiveProfiler
} from '../lib/profiling';

// ANSI escape codes for terminal formatting
const COLORS = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	blue: '\x1b[34m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m'
};

// Set up error logging
const LOG_DIR = 'logs';
const ERROR_LOG_FILE = path.join(
	LOG_DIR,
	`job-generator-errors-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`
);

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
	fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create error logging function
function logError(message: string, error?: Error | unknown, address?: Address) {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp,
		message,
		error: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		address: address
			? {
					id: address.id,
					street: address.street,
					houseNumber: address.houseNumber,
					city: address.city,
					lat: address.lat,
					lon: address.lon
				}
			: undefined
	};

	// Keep as sync to preserve ordering and avoid buffering surprises; this can be profiled via --profile.
	profiledSync('io.error_log.append', () => {
		fs.appendFileSync(ERROR_LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n\n');
	});
}

// Wrapper function for job generation with error logging
async function generateJobWithErrorLogging(
	address: Address,
	options?: { dryRun?: boolean }
): Promise<boolean> {
	try {
		return await generateJobFromAddress(address, undefined, 0, options);
	} catch (error) {
		logError('Job generation failed', error, address);
		return false;
	}
}

type CliOptions = {
	clearExisting: boolean;
	dryRun: boolean;
	limit?: number;
	pageSize: number;
	concurrency: number;
	noProgress: boolean;
	profile: boolean;
	profileSampleRate: number;
	profileOutFile?: string;
};

function hasFlag(args: string[], ...flags: string[]): boolean {
	return flags.some((flag) => args.includes(flag));
}

function getFlagValue(args: string[], flag: string): string | undefined {
	const eqPrefix = `${flag}=`;
	const eqMatch = args.find((a) => a.startsWith(eqPrefix));
	if (eqMatch) return eqMatch.slice(eqPrefix.length);
	const idx = args.indexOf(flag);
	if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('-')) {
		return args[idx + 1];
	}
	return undefined;
}

function parsePositiveInt(value: string | undefined, name: string): number | undefined {
	if (value === undefined) return undefined;
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n <= 0) {
		throw new Error(`Invalid ${name}: "${value}" (expected positive integer)`);
	}
	return n;
}

function parseProbability(value: string | undefined, name: string): number | undefined {
	if (value === undefined) return undefined;
	const n = Number.parseFloat(value);
	if (!Number.isFinite(n) || n < 0 || n > 1) {
		throw new Error(`Invalid ${name}: "${value}" (expected number in [0, 1])`);
	}
	return n;
}

function parseCliOptions(argv: string[]): CliOptions {
	const args = argv.slice(2);
	const clearExisting = hasFlag(args, '--clear', '-c');

	const limit = parsePositiveInt(getFlagValue(args, '--limit'), '--limit');
	const pageSize = parsePositiveInt(getFlagValue(args, '--page-size'), '--page-size') ?? 1000;
	const concurrency = parsePositiveInt(getFlagValue(args, '--concurrency'), '--concurrency') ?? 20;

	const dryRun = hasFlag(args, '--dry-run');
	const noProgress = hasFlag(args, '--no-progress');

	const profile = hasFlag(args, '--profile');
	const profileSampleRate =
		parseProbability(getFlagValue(args, '--profile-sample-rate'), '--profile-sample-rate') ?? 0.05;
	const profileOutFile = getFlagValue(args, '--profile-out');

	return {
		clearExisting,
		dryRun,
		limit,
		pageSize,
		concurrency,
		noProgress,
		profile,
		profileSampleRate,
		profileOutFile
	};
}

async function generateJobsWithProgress(options: CliOptions) {
	try {
		const { clearExisting, dryRun, limit, pageSize, concurrency, noProgress } = options;

		if (clearExisting) {
			// Clear existing jobs if flag is set
			console.log(`${COLORS.gray}🧹 Clearing existing jobs...${COLORS.reset}`);
			const clearStart = performance.now();
			await clearAllJobs();
			const clearTime = performance.now() - clearStart;
			console.log(`${COLORS.green}✅ Cleared jobs in ${clearTime.toFixed(0)}ms${COLORS.reset}\n`);
		}

		// Get total address count using Drizzle
		// Use LEFT JOIN with IS NULL instead of NOT IN for better performance
		console.log(
			`${COLORS.gray}📊 Counting addresses${clearExisting ? '' : ' without jobs'}...${COLORS.reset}`
		);
		const countStart = performance.now();
		const totalAddresses = clearExisting
			? ((await db.select({ count: count() }).from(addresses))[0]?.count ?? 0)
			: ((
					await db
						.select({ count: count() })
						.from(addresses)
						.leftJoin(jobs, sql`${jobs.startAddressId} = ${addresses.id}`)
						.where(isNull(jobs.id))
				)[0]?.count ?? 0);
		const countTime = performance.now() - countStart;
		console.log(
			`${COLORS.green}✅ Found ${COLORS.cyan}${totalAddresses.toLocaleString()}${COLORS.green} addresses in ${countTime.toFixed(0)}ms${COLORS.reset}\n`
		);

		if (totalAddresses === 0) {
			if (clearExisting) {
				console.error('No addresses found in database!');
			} else {
				console.log(
					`${COLORS.yellow}ℹ️  All addresses already have jobs. Use --clear flag to regenerate all jobs.${COLORS.reset}`
				);
			}
			return;
		}

		// Fetch all address IDs upfront to avoid OFFSET drift as jobs are created
		console.log(`${COLORS.gray}📋 Fetching address IDs...${COLORS.reset}`);
		const idsStart = performance.now();
		const addressIds: string[] = await profiledAsync('generator.db.fetch_all_ids', async () => {
			if (clearExisting) {
				const results = await db
					.select({ id: addresses.id })
					.from(addresses)
					.orderBy(asc(addresses.id));
				return results.map((row) => row.id);
			} else {
				const results = await db
					.select({ id: addresses.id })
					.from(addresses)
					.leftJoin(jobs, sql`${jobs.startAddressId} = ${addresses.id}`)
					.where(isNull(jobs.id))
					.orderBy(asc(addresses.id));
				return results.map((row) => row.id);
			}
		});
		const idsTime = performance.now() - idsStart;
		console.log(
			`${COLORS.green}✅ Fetched ${COLORS.cyan}${addressIds.length.toLocaleString()}${COLORS.green} address IDs in ${idsTime.toFixed(0)}ms${COLORS.reset}\n`
		);

		// Update total to match actual IDs fetched (should match, but ensures consistency)
		const actualTotal = addressIds.length;
		if (actualTotal !== totalAddresses) {
			console.log(
				`${COLORS.yellow}⚠️  Address count mismatch: count query=${totalAddresses.toLocaleString()}, IDs fetched=${actualTotal.toLocaleString()}${COLORS.reset}\n`
			);
		}

		const PAGE_SIZE = pageSize;
		const CONCURRENCY = concurrency;

		console.log(`${COLORS.bright}${COLORS.blue}🎯 Job Generation Configuration${COLORS.reset}`);
		console.log(
			`  Total Addresses: ${COLORS.cyan}${actualTotal.toLocaleString()}${COLORS.reset}`
		);
		console.log(
			`  Mode: ${COLORS.yellow}${clearExisting ? 'Regenerate All' : 'Skip Existing'}${COLORS.reset}`
		);
		console.log(`  Page Size: ${COLORS.yellow}${PAGE_SIZE.toLocaleString()}${COLORS.reset}`);
		console.log(`  Concurrency: ${COLORS.yellow}${CONCURRENCY}${COLORS.reset}`);
		if (dryRun) {
			console.log(`  Mode: ${COLORS.yellow}Dry-run (no inserts)${COLORS.reset}`);
		}
		if (limit !== undefined) {
			console.log(`  Limit: ${COLORS.yellow}${limit.toLocaleString()}${COLORS.reset}`);
		}
		console.log(`  Error Log: ${COLORS.gray}${ERROR_LOG_FILE}${COLORS.reset}\n`);

		// Initialize progress bar - use a dynamic total that updates as we discover more addresses
		const progressBar = noProgress
			? null
			: new cliProgress.SingleBar(
					{
						format: 'Progress |{bar}| {value}/{total} | ETA: {eta_formatted} | Success: {success}%',
						barCompleteChar: '\u2588',
						barIncompleteChar: '\u2591',
						hideCursor: true,
						etaBuffer: 50 // Smooth ETA calculation over 50 updates
					},
					cliProgress.Presets.shades_classic
				);

		// Start progress bar with actual total
		progressBar?.start(actualTotal, 0, {
			eta_formatted: '0s',
			success: '0.0'
		});

		let successCount = 0;
		let completed = 0;
		const startTime = performance.now();

		// Pagination loop: process address IDs in batches
		let batchIndex = 0;
		console.log(`${COLORS.gray}🔄 Starting job generation...${COLORS.reset}\n`);

		while (batchIndex < addressIds.length) {
			if (limit !== undefined && completed >= limit) {
				break;
			}

			// Get next batch of IDs
			const batchIds = addressIds.slice(batchIndex, batchIndex + PAGE_SIZE);
			if (batchIds.length === 0) {
				break;
			}

			// Fetch full address rows for this batch of IDs
			const addressesList: Address[] = await profiledAsync('generator.db.page_select', async () => {
				return await db.select().from(addresses).where(inArray(addresses.id, batchIds));
			});

			if (batchIds.length !== addressesList.length) {
				// Some addresses might have been deleted between ID fetch and row fetch
				// This is rare but handle gracefully - we'll just process what we found
				const foundIds = new Set(addressesList.map((a) => a.id));
				const missingIds = batchIds.filter((id) => !foundIds.has(id));
				if (missingIds.length > 0) {
					console.log(
						`${COLORS.yellow}⚠️  ${missingIds.length} addresses from batch not found (may have been deleted)${COLORS.reset}`
					);
				}
			}

			// Process addresses in this page in parallel batches
			for (let i = 0; i < addressesList.length; i += CONCURRENCY) {
				if (limit !== undefined && completed >= limit) break;
				const batch = addressesList.slice(i, i + CONCURRENCY);

				// Process batch in parallel
				const promises = batch.map(async (address) => {
					return await generateJobWithErrorLogging(address, { dryRun });
				});

				const results = await Promise.allSettled(promises).then((settled) => {
					return settled.map((result) => {
						if (result.status === 'fulfilled') {
							return result.value;
						} else {
							console.error(`Promise rejected: ${result.reason}`);
							return false;
						}
					});
				});

				// Update counters for the entire batch
				const batchSuccesses = results.filter((success) => success).length;
				completed += results.length;
				successCount += batchSuccesses;

				// Calculate ETA once per batch
				const elapsed = (performance.now() - startTime) / 1000;
				const rate = completed / elapsed;
				// Calculate remaining based on actual IDs we're processing
				const remaining = Math.max(0, addressIds.length - completed);
				const etaSeconds = remaining > 0 && rate > 0 ? remaining / rate : 0;

				// Format ETA
				let etaFormatted;
				if (remaining === 0) {
					etaFormatted = 'Done';
				} else if (etaSeconds < 60) {
					etaFormatted = `${Math.round(etaSeconds)}s`;
				} else if (etaSeconds < 3600) {
					etaFormatted = `${Math.floor(etaSeconds / 60)}m ${Math.round(etaSeconds % 60)}s`;
				} else {
					etaFormatted = `${Math.floor(etaSeconds / 3600)}h ${Math.floor((etaSeconds % 3600) / 60)}m`;
				}

				const successRate = completed > 0 ? (successCount / completed) * 100 : 0;

				// Update progress bar once per batch
				profiledSync('ui.progress.update', () => {
					progressBar?.update(Math.min(completed, actualTotal), {
						eta_formatted: etaFormatted,
						success: successRate.toFixed(1)
					});
				});
			}

			// Move to next batch
			batchIndex += PAGE_SIZE;
		}

		progressBar?.stop();

		// Show final statistics
		const totalTime = (performance.now() - startTime) / 1000;
		console.log(`\n${COLORS.bright}${COLORS.green}🎉 Job Generation Complete!${COLORS.reset}\n`);
		console.log(`${COLORS.bright}Final Statistics:${COLORS.reset}`);
		console.log(`  Total Jobs: ${COLORS.blue}${completed.toLocaleString()}${COLORS.reset}`);
		console.log(
			`  Successful: ${COLORS.green}${successCount.toLocaleString()}${COLORS.reset} (${((successCount / completed) * 100).toFixed(1)}%)`
		);
		console.log(
			`  Failed: ${COLORS.red}${(completed - successCount).toLocaleString()}${COLORS.reset} (${(((completed - successCount) / completed) * 100).toFixed(1)}%)`
		);
		console.log(`  Total Time: ${COLORS.cyan}${totalTime.toFixed(1)}s${COLORS.reset}`);
		console.log(
			`  Average Rate: ${COLORS.yellow}${(completed / totalTime).toFixed(1)} jobs/second${COLORS.reset}`
		);
		console.log(`\n${COLORS.gray}📄 Error details logged to: ${ERROR_LOG_FILE}${COLORS.reset}`);
	} catch (error) {
		console.error(`\n${COLORS.red}❌ Error: ${error}${COLORS.reset}`);
		if (error instanceof AggregateError) {
			console.error(`${COLORS.red}AggregateError details:${COLORS.reset}`);
			console.error(`  Number of errors: ${error.errors.length}`);
			error.errors.forEach((err, idx) => {
				console.error(`  Error ${idx + 1}: ${err}`);
			});
		}
		if (error instanceof Error) {
			console.error(`${COLORS.red}Stack trace:${COLORS.reset}`);
			console.error(error.stack);
		}
		throw error;
	}
}

async function main() {
	let profiler: AggregatingProfiler | null = null;
	try {
		const options = parseCliOptions(process.argv);

		// Check for help flag
		const args = process.argv.slice(2);
		if (args.includes('--help') || args.includes('-h')) {
			console.log(`${COLORS.bright}Job Generator Script${COLORS.reset}\n`);
			console.log('Usage: npm run job-generator -- [options]\n');
			console.log('Options:');
			console.log('  --clear, -c    Clear all existing jobs and regenerate for all addresses');
			console.log('  --dry-run      Do not insert jobs (useful for safe profiling)');
			console.log('  --limit N      Stop after attempting N jobs (useful for profiling)');
			console.log('  --page-size N  Page size for address pagination (default: 1000)');
			console.log('  --concurrency N  Parallelism within each page (default: 20)');
			console.log('  --no-progress  Disable the progress bar (can reduce overhead)');
			console.log('  --profile      Enable internal timing breakdown report');
			console.log(
				'  --profile-sample-rate R  Sample rate in [0,1] for p95 estimation (default: 0.05)'
			);
			console.log(
				'  --profile-out FILE  Write JSON profile report to FILE (default: logs/job-generator-profile-*.json)'
			);
			console.log('  --help, -h     Show this help message\n');
			console.log(
				'By default, the script only generates jobs for addresses that do not already have jobs.'
			);
			console.log('Use --clear to regenerate all jobs from scratch.\n');
			process.exit(0);
		}

		if (options.profile) {
			profiler = new AggregatingProfiler({
				sampleRate: options.profileSampleRate,
				maxSamplesPerTimer: 5000
			});
			setActiveProfiler(profiler);
		}

		await generateJobsWithProgress(options);
	} finally {
		if (profiler) {
			setActiveProfiler(null);
			const stats = profiler.getTimerStats();
			const counters = profiler.getCounters();
			const now = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
			const defaultOut = path.join(LOG_DIR, `job-generator-profile-${now}.json`);
			const outFile = parseCliOptions(process.argv).profileOutFile ?? defaultOut;

			const report = {
				generated_at: new Date().toISOString(),
				note: 'Timer totals are sum of per-call durations; with concurrency they can exceed wall-clock time.',
				counters,
				timers: stats
			};

			fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

			console.log(`\n${COLORS.bright}${COLORS.cyan}🔬 Profiling Summary${COLORS.reset}`);
			console.log(`${COLORS.gray}Wrote JSON report to: ${outFile}${COLORS.reset}\n`);

			const top = stats.slice(0, 20);
			for (const s of top) {
				const p95 = s.p95Ms !== undefined ? `${s.p95Ms.toFixed(1)}ms` : '-';
				console.log(
					`${COLORS.gray}${s.name}${COLORS.reset}  ` +
						`count=${s.count} total=${s.totalMs.toFixed(0)}ms avg=${s.avgMs.toFixed(2)}ms ` +
						`p95=${p95} max=${s.maxMs.toFixed(1)}ms samples=${s.sampleCount}`
				);
			}
			if (stats.length > top.length) {
				console.log(
					`${COLORS.gray}\n... (${stats.length - top.length} more timers)${COLORS.reset}`
				);
			}
		}

		// Close database connection
		await client.end();
	}
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
	console.log(`\n\n${COLORS.yellow}⚠️  Job generation interrupted by user${COLORS.reset}`);
	await client.end();
	process.exit(0);
});

main().catch(console.error);
