// Script to test the complete routes cheat functionality
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testCompleteRoutesCheat() {
    console.log('Testing Complete Routes Cheat');
    console.log('-----------------------------');
    
    // Connect to database
    const client = createClient({
        url: process.env.DATABASE_URL || 'file:local.db'
    });
    
    // Create database connection with the schema
    const db = drizzle(client, { schema });
    
    try {
        // First, let's see what active routes exist
        console.log('Looking for active routes...');
        
        const activeRoutes = await db
            .select({
                employee: schema.employees,
                route: schema.routes
            })
            .from(schema.employees)
            .innerJoin(schema.routes, eq(schema.employees.currentRoute, schema.routes.id))
            .where(
                and(
                    isNotNull(schema.employees.currentRoute),
                    isNotNull(schema.routes.startTime),
                    isNull(schema.routes.endTime)
                )
            );
        
        console.log(`Found ${activeRoutes.length} active routes:`);
        activeRoutes.forEach(({ employee, route }) => {
            console.log(`  Employee ${employee.name} (${employee.id}) on route ${route.id}`);
            console.log(`    Route: ${route.startTime ? new Date(route.startTime).toISOString() : 'null'} -> ${route.endTime ? new Date(route.endTime).toISOString() : 'null'}`);
            console.log(`    Reward: €${route.reward}`);
        });
        
        if (activeRoutes.length === 0) {
            console.log('No active routes to complete');
            return;
        }
        
        // Simulate the cheat completion
        let totalReward = 0;
        const currentTime = Date.now();
        
        console.log('\nSimulating route completion...');
        
        for (const { employee, route } of activeRoutes) {
            totalReward += route.reward;
            console.log(`  Completing route ${route.id} for employee ${employee.name} - reward: €${route.reward}`);
        }
        
        console.log(`\nTotal reward would be: €${totalReward}`);
        console.log(`Current timestamp: ${currentTime} (${new Date(currentTime).toISOString()})`);
        
        // Ask if we should actually complete them
        console.log('\nThis was a dry run. To actually complete routes, run the cheat through the UI.');
        
    } catch (error) {
        console.error('Error testing complete routes cheat:', error);
    }
}

testCompleteRoutesCheat(); 