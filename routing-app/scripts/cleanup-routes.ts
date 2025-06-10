// Script to clean up old routes from the database
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/server/db/schema';
import { and, isNotNull, lt, inArray, eq } from 'drizzle-orm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Cleans up expired routes (completed routes older than 1 hour)
 */
async function cleanupExpiredRoutes(db: any, client: any): Promise<void> {
    const oneHourAgo = Date.now() - 60 * 60 * 1000; // Get timestamp in milliseconds
    
    try {
        console.log(`Looking for routes completed before: ${new Date(oneHourAgo).toISOString()}`);
        
        // First, let's see what routes exist and their endTime values
        const allRoutes = await db.select({
            id: schema.routes.id,
            endTime: schema.routes.endTime,
            startTime: schema.routes.startTime
        }).from(schema.routes);
        
        console.log('Current routes:');
        allRoutes.forEach(route => {
            console.log(`  Route ${route.id}: startTime=${route.startTime ? new Date(route.startTime).toISOString() : 'null'}, endTime=${route.endTime ? new Date(route.endTime).toISOString() : 'null'}`);
        });
        
        // Find routes that should be deleted (completed and older than 1 hour)
        const routesToDelete = allRoutes.filter(route => 
            route.endTime && route.endTime < oneHourAgo
        );
        
        if (routesToDelete.length === 0) {
            console.log('No expired routes to delete');
            return;
        }
        
        const routeIdsToDelete = routesToDelete.map(r => r.id);
        console.log(`Found ${routesToDelete.length} expired routes to delete:`, routeIdsToDelete);
        
        // First, clean up any employee references to these routes
        const allEmployees = await db.select().from(schema.employees);
        for (const employee of allEmployees) {
            let needsUpdate = false;
            let availableRouteIds = JSON.parse(employee.availableRoutes as string) as string[];
            let currentRoute = employee.currentRoute;
            
            // Remove expired routes from available routes
            const filteredRouteIds = availableRouteIds.filter(id => !routeIdsToDelete.includes(id));
            if (filteredRouteIds.length !== availableRouteIds.length) {
                availableRouteIds = filteredRouteIds;
                needsUpdate = true;
            }
            
            // Clear current route if it's being deleted
            if (currentRoute && routeIdsToDelete.includes(currentRoute)) {
                currentRoute = null;
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                await db.update(schema.employees)
                    .set({
                        availableRoutes: JSON.stringify(availableRouteIds),
                        currentRoute: currentRoute
                    })
                    .where(eq(schema.employees.id, employee.id));
                
                console.log(`Cleaned up route references for employee ${employee.id}`);
            }
        }
        
        // Now delete the expired routes (should work without foreign key issues)
        const result = await client.execute({
            sql: "DELETE FROM route WHERE end_time IS NOT NULL AND end_time < ?",
            args: [oneHourAgo]
        });
        
        console.log(`Deleted ${result.rowsAffected} expired routes`);
        
    } catch (error) {
        console.error('Error cleaning up expired routes:', error);
    }
}

/**
 * Cleans up route references in employees that point to non-existent routes
 */
async function cleanupOrphanedRouteReferences(db: any): Promise<void> {
    try {
        const allEmployees = await db.select().from(schema.employees);
        
        for (const employee of allEmployees) {
            let needsUpdate = false;
            let availableRouteIds = JSON.parse(employee.availableRoutes as string) as string[];
            
            // Check if available routes still exist
            if (availableRouteIds.length > 0) {
                const existingRoutes = await db.select({ id: schema.routes.id })
                    .from(schema.routes)
                    .where(inArray(schema.routes.id, availableRouteIds));
                
                const existingRouteIds = existingRoutes.map(r => r.id);
                const filteredRouteIds = availableRouteIds.filter(id => existingRouteIds.includes(id));
                
                if (filteredRouteIds.length !== availableRouteIds.length) {
                    availableRouteIds = filteredRouteIds;
                    needsUpdate = true;
                }
            }
            
            // Check if current route still exists
            let currentRoute = employee.currentRoute;
            if (currentRoute) {
                const routeExists = await db.select({ id: schema.routes.id })
                    .from(schema.routes)
                    .where(eq(schema.routes.id, currentRoute))
                    .limit(1);
                
                if (routeExists.length === 0) {
                    currentRoute = null;
                    needsUpdate = true;
                }
            }
            
            // Update employee if needed
            if (needsUpdate) {
                await db.update(schema.employees)
                    .set({
                        availableRoutes: JSON.stringify(availableRouteIds),
                        currentRoute: currentRoute
                    })
                    .where(eq(schema.employees.id, employee.id));
                
                console.log(`Cleaned up orphaned route references for employee ${employee.id}`);
            }
        }
    } catch (error) {
        console.error('Error cleaning up orphaned route references:', error);
    }
}

async function main() {
    console.log('Route Cleanup Script');
    console.log('--------------------');
    
    // Connect to database
    const client = createClient({
        url: process.env.DATABASE_URL || 'file:local.db'
    });
    
    // Create database connection with the schema
    const db = drizzle(client, { schema });
    
    try {
        // Get current route count
        const routeCountBefore = await db.select().from(schema.routes);
        console.log(`Routes before cleanup: ${routeCountBefore.length}`);
        
        // Run cleanup
        await cleanupExpiredRoutes(db, client);
        
        // Get route count after cleanup
        const routeCountAfter = await db.select().from(schema.routes);
        console.log(`Routes after cleanup: ${routeCountAfter.length}`);
        console.log(`Removed ${routeCountBefore.length - routeCountAfter.length} routes`);
        
        console.log('Route cleanup completed successfully!');
    } catch (error) {
        console.error('Error during route cleanup:', error);
        process.exit(1);
    }
    
    process.exit(0);
}

main(); 