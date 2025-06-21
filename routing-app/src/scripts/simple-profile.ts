#!/usr/bin/env tsx

import { performance, PerformanceObserver } from 'perf_hooks';
import { generateJobFromAddress, clearAllJobs } from '../lib/generateJobs.js';
import { db, client } from '../lib/server/db/standalone.js';
import { addresses } from '../lib/server/db/schema.js';

// Performance measurement
const measurements: Map<string, number[]> = new Map();

function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
	return new Promise(async (resolve, reject) => {
		const start = performance.now();
		try {
			const result = await fn();
			const duration = performance.now() - start;

			if (!measurements.has(label)) {
				measurements.set(label, []);
			}
			measurements.get(label)!.push(duration);

			resolve(result);
		} catch (error) {
			reject(error);
		}
	});
}

async function profiledGenerateJob(address: any) {
	return measure('generateJobFromAddress', () => generateJobFromAddress(address));
}

async function main() {
	try {
		console.log('🔍 Simple Performance Profiling\n');

		// Clear existing jobs
		await measure('clearAllJobs', () => clearAllJobs());

		// Get sample addresses
		const sampleAddresses = await measure('selectAddresses', () =>
			db.select().from(addresses).limit(100)
		);

		console.log(`Profiling with ${sampleAddresses.length} addresses...\n`);

		let successCount = 0;
		const overallStart = performance.now();

		for (const address of sampleAddresses) {
			const success = await profiledGenerateJob(address);
			if (success) successCount++;
		}

		const overallTime = performance.now() - overallStart;

		console.log(`\n✅ Complete! Generated ${successCount}/${sampleAddresses.length} jobs`);
		console.log(`📊 Performance Analysis:\n`);

		// Analyze measurements
		for (const [label, times] of measurements) {
			const total = times.reduce((a, b) => a + b, 0);
			const avg = total / times.length;
			const min = Math.min(...times);
			const max = Math.max(...times);

			console.log(`${label}:`);
			console.log(
				`  Total: ${total.toFixed(1)}ms (${((total / overallTime) * 100).toFixed(1)}% of total time)`
			);
			console.log(`  Average: ${avg.toFixed(1)}ms per call`);
			console.log(`  Range: ${min.toFixed(1)}ms - ${max.toFixed(1)}ms`);
			console.log(`  Calls: ${times.length}`);
			console.log();
		}

		console.log(`Overall time: ${overallTime.toFixed(1)}ms`);
		console.log(`Average per job: ${(overallTime / sampleAddresses.length).toFixed(1)}ms`);
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
}

main().catch(console.error);
