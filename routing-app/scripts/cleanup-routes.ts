// Script to clean up old routes from the database
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/server/db/schema';
import { and, isNotNull, lt, inArray, eq } from 'drizzle-orm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Cleans up expired routes (completed routes older than 1 hour)
 */
async function cleanupExpiredRoutes(db: ReturnType<typeof drizzle>): Promise<void> {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // Get Date object for PostgreSQL timestamp

	try {
		console.log('Finding expired routes...');

		// First, find all expired routes using ORM
		const expiredRoutes = await db
			.select({ id: schema.routes.id })
			.from(schema.routes)
			.where(and(isNotNull(schema.routes.endTime), lt(schema.routes.endTime, oneHourAgo)));

		if (expiredRoutes.length === 0) {
			console.log('No expired routes found to clean up');
			return;
		}

		const routeIdsToDelete = expiredRoutes.map((r) => r.id);
		console.log(`Found ${expiredRoutes.length} expired routes to clean up`);

		// Get all employees to clean up route references
		const allEmployees = await db.select().from(schema.employees);

		// Clean up employee references to expired routes
		for (const employee of allEmployees) {
			let needsUpdate = false;
			let availableRouteIds: string[] = [];

			// Handle both SQLite (string) and PostgreSQL (array) formats
			if (typeof employee.availableRoutes === 'string') {
				// SQLite format - parse JSON string
				availableRouteIds = JSON.parse(employee.availableRoutes) as string[];
			} else if (Array.isArray(employee.availableRoutes)) {
				// PostgreSQL format - already an array
				availableRouteIds = employee.availableRoutes as string[];
			} else {
				console.warn(
					`Employee ${employee.id} has invalid availableRoutes format, using empty array`
				);
				availableRouteIds = [];
			}

			// Remove expired routes from available routes
			const filteredRouteIds = availableRouteIds.filter((id) => !routeIdsToDelete.includes(id));
			if (filteredRouteIds.length !== availableRouteIds.length) {
				availableRouteIds = filteredRouteIds;
				needsUpdate = true;
			}

			// Clear current route if it's being deleted
			let currentRoute = employee.currentRoute;
			if (currentRoute && routeIdsToDelete.includes(currentRoute)) {
				currentRoute = null;
				needsUpdate = true;
			}

			if (needsUpdate) {
				await db
					.update(schema.employees)
					.set({
						availableRoutes: availableRouteIds,
						currentRoute: currentRoute
					})
					.where(eq(schema.employees.id, employee.id));

				console.log(`Cleaned up route references for employee ${employee.id}`);
			}
		}

		// Now delete the expired routes using ORM
		const deleteResult = await db
			.delete(schema.routes)
			.where(inArray(schema.routes.id, routeIdsToDelete))
			.returning({ id: schema.routes.id });

		console.log(`Deleted ${deleteResult.length} expired routes`);
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
			let availableRouteIds: string[] = [];

			// Handle both SQLite (string) and PostgreSQL (array) formats
			if (typeof employee.availableRoutes === 'string') {
				// SQLite format - parse JSON string
				availableRouteIds = JSON.parse(employee.availableRoutes) as string[];
			} else if (Array.isArray(employee.availableRoutes)) {
				// PostgreSQL format - already an array
				availableRouteIds = employee.availableRoutes as string[];
			} else {
				console.warn(
					`Employee ${employee.id} has invalid availableRoutes format, using empty array`
				);
				availableRouteIds = [];
			}

			// Check if available routes still exist
			if (availableRouteIds.length > 0) {
				const existingRoutes = await db
					.select({ id: schema.routes.id })
					.from(schema.routes)
					.where(inArray(schema.routes.id, availableRouteIds));

				const existingRouteIds = existingRoutes.map((r) => r.id);
				const filteredRouteIds = availableRouteIds.filter((id) => existingRouteIds.includes(id));

				if (filteredRouteIds.length !== availableRouteIds.length) {
					availableRouteIds = filteredRouteIds;
					needsUpdate = true;
				}
			}

			// Check if current route still exists
			let currentRoute = employee.currentRoute;
			if (currentRoute) {
				const routeExists = await db
					.select({ id: schema.routes.id })
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
				await db
					.update(schema.employees)
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
	const client = postgres(
		process.env.DATABASE_URL ||
			'postgresql://routing_user:routing_password@localhost:5432/routing_game'
	);

	// Create database connection with the schema
	const db = drizzle(client, { schema });

	try {
		// Get current route count
		const routeCountBefore = await db.select().from(schema.routes);
		console.log(`Routes before cleanup: ${routeCountBefore.length}`);

		// Run cleanup
		await cleanupExpiredRoutes(db);

		// Get route count after cleanup
		const routeCountAfter = await db.select().from(schema.routes);
		console.log(`Routes after cleanup: ${routeCountAfter.length}`);
		console.log(`Removed ${routeCountBefore.length - routeCountAfter.length} routes`);

		console.log('Route cleanup completed successfully!');
	} catch (error) {
		console.error('Error during route cleanup:', error);
		process.exit(1);
	}

	await client.end();
	process.exit(0);
}

main();
