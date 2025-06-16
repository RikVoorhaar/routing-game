// Script to test the complete routes cheat functionality
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testCompleteRoutesCheat() {
    console.log('Testing Complete Routes Cheat');
    console.log('-----------------------------');
    
    // Connect to database
    const client = postgres(
        process.env.DATABASE_URL || 'postgresql://routing_user:routing_password@localhost:5432/routing_game'
    );
    
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
            console.log(`    Route: ${route.startTime ? route.startTime.toISOString() : 'null'} -> ${route.endTime ? route.endTime.toISOString() : 'null'}`);
            console.log(`    Reward: €${route.reward}`);
        });
        
        if (activeRoutes.length === 0) {
            console.log('No active routes to complete');
            return;
        }
        
        // Simulate the cheat completion
        let totalReward = 0;
        const currentTime = new Date();
        
        console.log('\nSimulating route completion...');
        
        for (const { employee, route } of activeRoutes) {
            console.log(`Completing route ${route.id} for employee ${employee.name}...`);
            
            // Update route completion
            await db.update(schema.routes)
                .set({ endTime: currentTime })
                .where(eq(schema.routes.id, route.id));
            
            // Clear employee's current route
            await db.update(schema.employees)
                .set({ currentRoute: null })
                .where(eq(schema.employees.id, employee.id));
            
            // Add to total reward
            totalReward += parseFloat(route.reward.toString());
            
            console.log(`  Completed! Reward: €${route.reward}`);
        }
        
        console.log(`\nTotal rewards earned: €${totalReward.toFixed(2)}`);
        console.log('All active routes completed successfully!');
        
    } catch (error) {
        console.error('Error during cheat test:', error);
    } finally {
        await client.end();
    }
}

// Run the test
testCompleteRoutesCheat(); 