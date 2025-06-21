#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import { generateJobFromAddress, clearAllJobs } from '../lib/generateJobs.js';
import { db, client } from '../lib/server/db/standalone.js';
import { addresses } from '../lib/server/db/schema.js';

async function main() {
	try {
		console.log('🔍 Parallel Processing Performance Test\n');

		// Clear existing jobs
		const clearStart = performance.now();
		await clearAllJobs();
		const clearTime = performance.now() - clearStart;

		// Get sample addresses
		const selectStart = performance.now();
		const sampleAddresses = await db.select().from(addresses).limit(100);
		const selectTime = performance.now() - selectStart;

		console.log(
			`Profiling with ${sampleAddresses.length} addresses using parallel processing...\n`
		);

		// Test different concurrency levels
		const concurrencyLevels = [1, 5, 10, 20];

		for (const concurrency of concurrencyLevels) {
			await testConcurrency(sampleAddresses, concurrency);
		}
	} catch (error) {
		console.error('Error:', error);
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
}

async function testConcurrency(sampleAddresses: any[], concurrency: number) {
	console.log(`\n🚀 Testing concurrency level: ${concurrency}`);

	// Clear jobs before each test
	await clearAllJobs();

	const startTime = performance.now();
	let successCount = 0;

	// Process addresses in batches
	for (let i = 0; i < sampleAddresses.length; i += concurrency) {
		const batch = sampleAddresses.slice(i, i + concurrency);

		// Process batch in parallel
		const promises = batch.map((address) => generateJobFromAddress(address));
		const results = await Promise.all(promises);

		// Count successes
		successCount += results.filter((success) => success).length;
	}

	const totalTime = performance.now() - startTime;

	console.log(`  ✅ Generated ${successCount}/${sampleAddresses.length} jobs`);
	console.log(`  ⏱️  Total time: ${totalTime.toFixed(1)}ms`);
	console.log(`  📈 Average per job: ${(totalTime / sampleAddresses.length).toFixed(1)}ms`);
	console.log(
		`  🚄 Speed: ${(sampleAddresses.length / (totalTime / 1000)).toFixed(1)} jobs/second`
	);
}

main().catch(console.error);
