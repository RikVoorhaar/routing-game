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
import type { Address } from '../lib/server/db/schema';
import { sql } from 'drizzle-orm';
import { performance } from 'perf_hooks';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';
import * as path from 'path';

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

	fs.appendFileSync(ERROR_LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n\n');
}

// Wrapper function for job generation with error logging
async function generateJobWithErrorLogging(address: Address): Promise<boolean> {
	try {
		return await generateJobFromAddress(address);
	} catch (error) {
		logError('Job generation failed', error, address);
		return false;
	}
}

async function generateJobsWithProgress() {
	try {
		// Get total address count first
		const totalAddressCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM address`);
		const totalAddresses = Number(totalAddressCountResult[0]?.count || 0);

		if (totalAddresses === 0) {
			console.error('No addresses found in database!');
			process.exit(1);
		}

		const PAGE_SIZE = 1000; // Configurable batch size for pagination
		const CONCURRENCY = 20; // Optimal from our testing

		console.log(`${COLORS.bright}${COLORS.blue}🎯 Job Generation Configuration${COLORS.reset}`);
		console.log(
			`  Total Addresses: ${COLORS.cyan}${totalAddresses.toLocaleString()}${COLORS.reset}`
		);
		console.log(`  Page Size: ${COLORS.yellow}${PAGE_SIZE.toLocaleString()}${COLORS.reset}`);
		console.log(`  Concurrency: ${COLORS.yellow}${CONCURRENCY}${COLORS.reset}`);
		console.log(
			`  Expected Time: ${COLORS.gray}~${Math.ceil((totalAddresses * 30) / 1000 / CONCURRENCY)}s${COLORS.reset}`
		);
		console.log(`  Error Log: ${COLORS.gray}${ERROR_LOG_FILE}${COLORS.reset}\n`);

		// Clear existing jobs
		console.log(`${COLORS.gray}🧹 Clearing existing jobs...${COLORS.reset}`);
		const clearStart = performance.now();
		await clearAllJobs();
		const clearTime = performance.now() - clearStart;
		console.log(`${COLORS.green}✅ Cleared jobs in ${clearTime.toFixed(0)}ms${COLORS.reset}\n`);

		// Initialize progress bar
		const progressBar = new cliProgress.SingleBar(
			{
				format: 'Progress |{bar}| {value}/{total} | ETA: {eta_formatted} | Success: {success}%',
				barCompleteChar: '\u2588',
				barIncompleteChar: '\u2591',
				hideCursor: true,
				etaBuffer: 50 // Smooth ETA calculation over 50 updates
			},
			cliProgress.Presets.shades_classic
		);

		progressBar.start(totalAddresses, 0, {
			eta_formatted: '0s',
			success: '0.0'
		});

		let successCount = 0;
		let completed = 0;
		const startTime = performance.now();

		// Pagination loop: fetch and process addresses in pages
		let offset = 0;
		let hasMore = true;

		while (hasMore) {
			// Fetch a page of addresses
			const pageAddresses = (await db.execute(sql`
				SELECT * FROM address 
				ORDER BY id 
				LIMIT ${PAGE_SIZE} 
				OFFSET ${offset}
			`)) as unknown as Array<Address>;

			if (pageAddresses.length === 0) {
				hasMore = false;
				break;
			}

			// Process addresses in this page in parallel batches
			for (let i = 0; i < pageAddresses.length; i += CONCURRENCY) {
				const batch = pageAddresses.slice(i, i + CONCURRENCY);

				// Process batch in parallel
				const promises = batch.map(async (address) => {
					return await generateJobWithErrorLogging(address);
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
				const remaining = totalAddresses - completed;
				const etaSeconds = remaining / rate;

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

				const successRate = (successCount / completed) * 100;

				// Update progress bar once per batch
				progressBar.update(completed, {
					eta_formatted: etaFormatted,
					success: successRate.toFixed(1)
				});
			}

			offset += PAGE_SIZE;
		}

		progressBar.stop();

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
		process.exit(1);
	}
}

async function main() {
	try {
		await generateJobsWithProgress();
	} finally {
		// Close database connection
		await client.end();
		process.exit(0);
	}
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
	console.log(`\n\n${COLORS.yellow}⚠️  Job generation interrupted by user${COLORS.reset}`);
	await client.end();
	process.exit(0);
});

main().catch(console.error);
