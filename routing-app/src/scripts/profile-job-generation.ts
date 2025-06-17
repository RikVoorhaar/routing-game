#!/usr/bin/env tsx

import { generateJobFromAddress, clearAllJobs } from '../lib/generateJobs.js';
import { db, client } from '../lib/server/db/standalone.js';
import { addresses } from '../lib/server/db/schema.js';

async function main() {
    try {
        console.log('Profiling job generation...');
        
        // Clear existing jobs
        await clearAllJobs();
        
        // Get sample addresses for profiling
        const sampleAddresses = await db.select().from(addresses).limit(100);
        console.log(`Profiling with ${sampleAddresses.length} addresses`);
        
        let successCount = 0;
        const startTime = Date.now();
        
        for (const address of sampleAddresses) {
            const success = await generateJobFromAddress(address);
            if (success) {
                successCount++;
            }
        }
        
        const totalTime = Date.now() - startTime;
        
        console.log(`Complete! Generated ${successCount}/${sampleAddresses.length} jobs in ${totalTime}ms`);
        console.log(`Average: ${(totalTime / sampleAddresses.length).toFixed(1)}ms per job`);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await client.end();
        process.exit(0);
    }
}

main().catch(console.error); 