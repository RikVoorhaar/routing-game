#!/usr/bin/env tsx

import { generateJobFromAddress, getJobsByValue, clearAllJobs } from '../lib/generateJobs.js';
import { db, client } from '../lib/server/db/standalone.js';
import { addresses } from '../lib/server/db/schema.js';
import { sql } from 'drizzle-orm';
import { performance } from 'perf_hooks';
import * as cliProgress from 'cli-progress';

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

const args = process.argv.slice(2);
const command = args[0] || 'help';

// Parse arguments for generate command
function parseGenerateArgs() {
	if (command !== 'generate') return { fraction: 0.01 }; // Default 1%

	let fraction = 0.01; // Default 1%

	// Look for fraction argument: --fraction=0.02 or -f 0.02
	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith('--fraction=')) {
			fraction = parseFloat(arg.split('=')[1]);
		} else if (arg === '-f' || arg === '--fraction') {
			if (i + 1 < args.length) {
				fraction = parseFloat(args[i + 1]);
				i++; // Skip next argument since we consumed it
			}
		}
	}

	// Validate fraction
	if (isNaN(fraction) || fraction <= 0 || fraction > 1) {
		console.error('Error: Fraction must be a number between 0 and 1');
		process.exit(1);
	}

	return { fraction };
}

async function main() {
	try {
		switch (command) {
			case 'test':
				await testJobGeneration();
				break;
			case 'generate':
				const { fraction } = parseGenerateArgs();
				await generateJobsWithProgress(fraction);
				break;
			case 'clear':
				await clearAllJobs();
				break;
			case 'stats':
				await showJobStats();
				break;
			case 'help':
			default:
				console.log(`
Job Generation Script

Commands:
  test      - Generate a few test jobs to validate the system
  generate  - Generate jobs for a fraction of all addresses with progress bar
  clear     - Clear all existing jobs
  stats     - Show job statistics
  help      - Show this help message

Generate Options:
  -f, --fraction  Fraction of addresses to sample (0-1, default: 0.01 = 1%)

Examples:
  npm run job-generator test
  npm run job-generator generate                          # Generate jobs for 1% of addresses
  npm run job-generator generate -- --fraction=0.02      # Generate jobs for 2% of addresses
  npm run job-generator generate -- -f 0.005             # Generate jobs for 0.5% of addresses
  npm run job-generator stats

Note: Use -- to pass arguments through npm to the script
                `);
				break;
		}
	} finally {
		// Close database connection
		await client.end();
		process.exit(0);
	}
}

async function testJobGeneration() {
	console.log('Testing job generation system...\n');

	try {
		// Get a few sample addresses to test with
		const sampleAddresses = await db.select().from(addresses).limit(5);
		console.log(`Found ${sampleAddresses.length} sample addresses`);

		// Test generating a few individual jobs
		let successCount = 0;
		for (const address of sampleAddresses) {
			console.log(`Generating job from: ${address.street} ${address.houseNumber}, ${address.city}`);
			const success = await generateJobFromAddress(address);
			if (success) {
				successCount++;
				console.log('✓ Job generated successfully');
			} else {
				console.log('✗ Job generation failed');
			}
		}

		console.log(`\nGenerated ${successCount} jobs out of ${sampleAddresses.length} attempts`);

		if (successCount > 0) {
			// Get the generated jobs
			const jobs = await getJobsByValue(10);
			console.log(`\nTop ${jobs.length} jobs by value:`);
			jobs.forEach((job, i) => {
				console.log(
					`${i + 1}. Tier ${job.jobTier}, Category ${job.jobCategory}, Value: €${Number(job.approximateValue).toFixed(2)}, Distance: ${Number(job.totalDistanceKm).toFixed(2)}km`
				);
			});
		}

		console.log('\nJob generation test completed successfully!');
	} catch (error) {
		console.error('Error testing job generation:', error);
		process.exit(1);
	}
}

async function showJobStats() {
	console.log('Job Statistics\n');

	try {
		// Get total job count
		const totalJobs = await db.execute(sql`SELECT COUNT(*) as count FROM job`);
		const jobCount = totalJobs[0]?.count || 0;
		console.log(`Total jobs: ${jobCount}`);

		if (jobCount === 0) {
			console.log('No jobs found in database.');
			return;
		}

		// Get job statistics by tier and category
		const jobStats = await db.execute(sql`
            SELECT 
                job_tier,
                job_category,
                COUNT(*) as count,
                AVG(approximate_value) as avg_value,
                MAX(approximate_value) as max_value,
                AVG(total_distance_km) as avg_distance
            FROM job 
            GROUP BY job_tier, job_category 
            ORDER BY job_tier, job_category
        `);

		console.log('\nJobs by tier and category:');
		console.log('Tier | Category | Count | Avg Value | Max Value | Avg Distance');
		console.log('-----|----------|-------|-----------|-----------|-------------');

		const categoryNames = [
			'Groceries',
			'Packages',
			'Food',
			'Furniture',
			'People',
			'Fragile',
			'Construction',
			'Liquids',
			'Toxic'
		];

		for (const row of jobStats) {
			const stats = row as {
				job_tier: number;
				job_category: number;
				count: string | number;
				avg_value: string | number;
				max_value: string | number;
				avg_distance: string | number;
			};
			const categoryName = categoryNames[stats.job_category] || `Cat${stats.job_category}`;
			console.log(
				`  ${stats.job_tier}  | ${categoryName.padEnd(9)} | ${String(stats.count).padStart(5)} | €${Number(stats.avg_value).toFixed(2).padStart(7)} | €${Number(stats.max_value).toFixed(2).padStart(7)} | ${Number(stats.avg_distance).toFixed(1).padStart(8)}km`
			);
		}

		// Get top 10 highest value jobs
		const topJobs = await getJobsByValue(10);
		if (topJobs.length > 0) {
			console.log('\nTop 10 highest value jobs:');
			topJobs.forEach((job, i) => {
				const categoryName = categoryNames[job.jobCategory] || `Cat${job.jobCategory}`;
				console.log(
					`${i + 1}. Tier ${job.jobTier} ${categoryName}: €${Number(job.approximateValue).toFixed(2)} (${Number(job.totalDistanceKm).toFixed(1)}km)`
				);
			});
		}
	} catch (error) {
		console.error('Error showing job statistics:', error);
		process.exit(1);
	}
}

async function generateJobsWithProgress(fraction: number = 0.01) {
	try {
		// Get total address count first
		const totalAddressCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM address`);
		const totalAddresses = Number(totalAddressCountResult[0]?.count || 0);

		if (totalAddresses === 0) {
			console.error('No addresses found in database!');
			process.exit(1);
		}

		// Calculate target number of jobs
		const TARGET_JOBS = Math.ceil(totalAddresses * fraction);
		const CONCURRENCY = 20; // Optimal from our testing

		console.log(`${COLORS.bright}${COLORS.blue}🎯 Job Generation Configuration${COLORS.reset}`);
		console.log(
			`  Total Addresses: ${COLORS.cyan}${totalAddresses.toLocaleString()}${COLORS.reset}`
		);
		console.log(
			`  Sample Fraction: ${COLORS.yellow}${(fraction * 100).toFixed(1)}%${COLORS.reset}`
		);
		console.log(`  Target Jobs: ${COLORS.cyan}${TARGET_JOBS.toLocaleString()}${COLORS.reset}`);
		console.log(`  Concurrency: ${COLORS.yellow}${CONCURRENCY}${COLORS.reset}`);
		console.log(
			`  Expected Time: ${COLORS.gray}~${Math.ceil((TARGET_JOBS * 30) / 1000 / CONCURRENCY)}s${COLORS.reset}\n`
		);

		// Clear existing jobs
		console.log(`${COLORS.gray}🧹 Clearing existing jobs...${COLORS.reset}`);
		const clearStart = performance.now();
		await clearAllJobs();
		const clearTime = performance.now() - clearStart;
		console.log(`${COLORS.green}✅ Cleared jobs in ${clearTime.toFixed(0)}ms${COLORS.reset}\n`);

		// Get random sample of addresses using SQL
		console.log(
			`${COLORS.gray}📍 Randomly selecting ${TARGET_JOBS.toLocaleString()} addresses...${COLORS.reset}`
		);
		const selectStart = performance.now();
		const sampleAddresses = (await db.execute(sql`
            SELECT * FROM address 
            ORDER BY RANDOM() 
            LIMIT ${TARGET_JOBS}
        `)) as unknown as Array<{
			id: string;
			street: string | null;
			houseNumber: string | null;
			postcode: string | null;
			city: string | null;
			location: string;
			lat: string;
			lon: string;
			createdAt: Date;
		}>;
		const selectTime = performance.now() - selectStart;
		console.log(
			`${COLORS.green}✅ Selected ${sampleAddresses.length.toLocaleString()} random addresses in ${selectTime.toFixed(0)}ms${COLORS.reset}\n`
		);

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

		progressBar.start(sampleAddresses.length, 0, {
			eta_formatted: '0s',
			success: '0.0'
		});

		let successCount = 0;
		let completed = 0;
		const startTime = performance.now();

		// Process addresses in parallel batches
		for (let i = 0; i < sampleAddresses.length; i += CONCURRENCY) {
			const batch = sampleAddresses.slice(i, i + CONCURRENCY);

			// Process batch in parallel
			const promises = batch.map(async (address) => {
				try {
					const success = await generateJobFromAddress(address);
					return success;
				} catch {
					return false;
				}
			});

			const results = await Promise.all(promises);

			// Update counters for the entire batch
			const batchSuccesses = results.filter((success) => success).length;
			completed += results.length;
			successCount += batchSuccesses;

			// Calculate ETA once per batch
			const elapsed = (performance.now() - startTime) / 1000;
			const rate = completed / elapsed;
			const remaining = sampleAddresses.length - completed;
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

		progressBar.stop();

		// Show final statistics
		const totalTime = (performance.now() - startTime) / 1000;
		console.log(`\n${COLORS.bright}${COLORS.green}🎉 Job Generation Complete!${COLORS.reset}\n`);
		console.log(`${COLORS.bright}Final Statistics:${COLORS.reset}`);
		console.log(
			`  Total Jobs: ${COLORS.blue}${sampleAddresses.length.toLocaleString()}${COLORS.reset}`
		);
		console.log(
			`  Successful: ${COLORS.green}${successCount.toLocaleString()}${COLORS.reset} (${((successCount / sampleAddresses.length) * 100).toFixed(1)}%)`
		);
		console.log(
			`  Failed: ${COLORS.red}${(sampleAddresses.length - successCount).toLocaleString()}${COLORS.reset} (${(((sampleAddresses.length - successCount) / sampleAddresses.length) * 100).toFixed(1)}%)`
		);
		console.log(`  Total Time: ${COLORS.cyan}${totalTime.toFixed(1)}s${COLORS.reset}`);
		console.log(
			`  Average Rate: ${COLORS.yellow}${(sampleAddresses.length / totalTime).toFixed(1)} jobs/second${COLORS.reset}`
		);
	} catch (error) {
		console.error(`\n${COLORS.red}❌ Error: ${error}${COLORS.reset}`);
		process.exit(1);
	}
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
	console.log(`\n\n${COLORS.yellow}⚠️  Job generation interrupted by user${COLORS.reset}`);
	await client.end();
	process.exit(0);
});

main().catch(console.error);
