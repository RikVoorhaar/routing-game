import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, employees, routes, activeJobs, addresses, jobs } from '$lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { DEFAULT_EMPLOYEE_LOCATION, computeEmployeeCosts } from '$lib/types';

// POST /api/employees - Hire a new employee
export const POST: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { gameStateId, employeeName } = await request.json();
        
        if (!gameStateId || !employeeName || typeof employeeName !== 'string') {
            return error(400, 'Game state ID and employee name are required');
        }

        // Verify the game state belongs to the current user
        const [gameState] = await db
            .select()
            .from(gameStates)
            .where(
                and(
                    eq(gameStates.id, gameStateId),
                    eq(gameStates.userId, session.user.id)
                )
            )
            .limit(1);

        if (!gameState) {
            return error(404, 'Game state not found or access denied');
        }

        // Get current employee count for this game state
        const existingEmployees = await db
            .select()
            .from(employees)
            .where(eq(employees.gameId, gameStateId));

        const employeeCount = existingEmployees.length;
        const hiringCost = computeEmployeeCosts(employeeCount);

        // Check if user has enough money - convert string to number if needed
        const currentMoney = typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money;
        if (currentMoney < hiringCost) {
            return error(400, `Insufficient funds. Need €${hiringCost}, but only have €${gameState.money}`);
        }

        // Create the new employee
        const newEmployee = {
            id: nanoid(),
            gameId: gameStateId,
            name: employeeName.trim(),
            upgradeState: JSON.stringify({ vehicleType: 'bicycle', capacity: 10 }),
            location: JSON.stringify(DEFAULT_EMPLOYEE_LOCATION),
            availableRoutes: JSON.stringify([]), // Will be populated from job market
            timeRoutesGenerated: null, // Not used in new system
            speedMultiplier: '1.0',
            maxSpeed: '20'
        };

        // Use a transaction to ensure consistency
        await db.transaction(async (tx) => {
            // Insert the new employee
            await tx.insert(employees).values(newEmployee);

            // Deduct the hiring cost from game state money
            const newMoney = currentMoney - hiringCost;
            
            await tx.update(gameStates)
                .set({ money: newMoney.toString() })
                .where(eq(gameStates.id, gameStateId));
        });

        return json({
            employee: newEmployee,
            newBalance: (typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money) - hiringCost
        }, { status: 201 });

    } catch (err) {
        console.error('Error hiring employee:', err);
        return error(500, 'Failed to hire employee');
    }
};

// PUT /api/employees - Assign or complete jobs
export const PUT: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { action, employeeId, gameStateId, routeId, jobId } = await request.json();
        
        if (!action || !employeeId || !gameStateId) {
            return error(400, 'Action, employee ID, and game state ID are required');
        }

        // Verify the game state belongs to the current user
        const [gameState] = await db
            .select()
            .from(gameStates)
            .where(
                and(
                    eq(gameStates.id, gameStateId),
                    eq(gameStates.userId, session.user.id)
                )
            )
            .limit(1);

        if (!gameState) {
            return error(404, 'Game state not found or access denied');
        }

        // Get the employee and verify ownership
        const [employee] = await db
            .select()
            .from(employees)
            .where(
                and(
                    eq(employees.id, employeeId),
                    eq(employees.gameId, gameStateId)
                )
            )
            .limit(1);

        if (!employee) {
            return error(404, 'Employee not found');
        }

        if (action === 'assignJob') {
            if (!jobId) {
                return error(400, 'Job ID is required for job assignment');
            }

            // Check if employee is already on an active job
            const [existingActiveJob] = await db
                .select()
                .from(activeJobs)
                .where(eq(activeJobs.employeeId, employeeId))
                .limit(1);

            if (existingActiveJob) {
                return error(400, 'Employee is already on an active job');
            }

            // Get the job details with its route
            const [job] = await db
                .select({
                    job: jobs,
                    route: routes
                })
                .from(jobs)
                .innerJoin(routes, eq(jobs.routeId, routes.id))
                .where(eq(jobs.id, jobId))
                .limit(1);

            if (!job) {
                return error(404, 'Job not found');
            }

            // Parse employee location
            let employeeLocation;
            try {
                if (typeof employee.location === 'string') {
                    employeeLocation = JSON.parse(employee.location);
                } else {
                    employeeLocation = employee.location;
                }
            } catch {
                return error(400, 'Invalid employee location format');
            }

            // Get start address for the job
            const [startAddress] = await db
                .select()
                .from(addresses)
                .where(eq(addresses.id, job.route.startAddressId))
                .limit(1);

            if (!startAddress) {
                return error(404, 'Job start address not found');
            }

            // Determine if employee needs to travel to job start
            let routeToJobId = null;
            let needsTravel = false;

            // Check if employee is already at the job start location (within 100m)
            if (employeeLocation) {
                const empLat = employeeLocation.lat || 0;
                const empLon = employeeLocation.lon || 0;
                const startLat = parseFloat(startAddress.lat);
                const startLon = parseFloat(startAddress.lon);
                
                // Simple distance check (rough approximation)
                const latDiff = Math.abs(empLat - startLat);
                const lonDiff = Math.abs(empLon - startLon);
                const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // Convert to meters
                
                if (distance > 100) {
                    needsTravel = true;
                    // In a real implementation, you would generate a route from employee location to job start
                    // For now, we'll skip the travel phase
                }
            }

            // Create modified route data based on employee modifiers
            const speedMultiplier = parseFloat(employee.speedMultiplier as string) || 1.0;
            const originalRouteData = job.route.routeData as any;
            
            const modifiedJobRouteData = {
                ...originalRouteData,
                travelTimeSeconds: originalRouteData.travelTimeSeconds / speedMultiplier
            };

            // Use a transaction to ensure consistency
            await db.transaction(async (tx) => {
                // Create active job
                const activeJobId = nanoid();
                await tx.insert(activeJobs).values({
                    id: activeJobId,
                    employeeId: employeeId,
                    jobId: jobId,
                    routeToJobId: routeToJobId,
                    jobRouteId: job.route.id,
                    startTime: new Date(),
                    endTime: null,
                    modifiedRouteToJobData: null, // No travel needed for now
                    modifiedJobRouteData: modifiedJobRouteData,
                    currentPhase: needsTravel ? 'traveling_to_job' : 'on_job',
                    jobPhaseStartTime: needsTravel ? null : new Date()
                });

                // Remove the job from the job market (it's now taken)
                await tx.delete(jobs).where(eq(jobs.id, jobId));
            });

            return json({ success: true, message: 'Job assigned successfully' });

        } else if (action === 'assignRoute') {
            // This is for employee-generated routes (still supported)
            if (!routeId) {
                return error(400, 'Route ID is required for route assignment');
            }

            // Verify the route exists and belongs to this employee
            let availableRoutes: string[] = [];
            if (typeof employee.availableRoutes === 'string') {
                availableRoutes = JSON.parse(employee.availableRoutes) as string[];
            } else if (Array.isArray(employee.availableRoutes)) {
                availableRoutes = employee.availableRoutes as string[];
            } else {
                return error(400, 'Invalid availableRoutes format');
            }
            
            if (!availableRoutes.includes(routeId)) {
                return error(400, 'Route not available for this employee');
            }

            // Check if employee is already on an active job
            const [existingActiveJob] = await db
                .select()
                .from(activeJobs)
                .where(eq(activeJobs.employeeId, employeeId))
                .limit(1);

            if (existingActiveJob) {
                return error(400, 'Employee is already on an active job');
            }

            // Get the route details
            const [route] = await db
                .select()
                .from(routes)
                .where(eq(routes.id, routeId))
                .limit(1);

            if (!route) {
                return error(404, 'Route not found');
            }

            // Parse employee location
            let employeeLocation;
            try {
                if (typeof employee.location === 'string') {
                    employeeLocation = JSON.parse(employee.location);
                } else {
                    employeeLocation = employee.location;
                }
            } catch {
                return error(400, 'Invalid employee location format');
            }

            // Get start address for the route
            const [startAddress] = await db
                .select()
                .from(addresses)
                .where(eq(addresses.id, route.startAddressId))
                .limit(1);

            if (!startAddress) {
                return error(404, 'Route start address not found');
            }

            // Determine if employee needs to travel to job start
            let routeToJobId = null;
            let needsTravel = false;

            // Check if employee is already at the job start location (within 100m)
            if (employeeLocation) {
                const empLat = employeeLocation.lat || 0;
                const empLon = employeeLocation.lon || 0;
                const startLat = parseFloat(startAddress.lat);
                const startLon = parseFloat(startAddress.lon);
                
                // Simple distance check (rough approximation)
                const latDiff = Math.abs(empLat - startLat);
                const lonDiff = Math.abs(empLon - startLon);
                const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // Convert to meters
                
                if (distance > 100) {
                    needsTravel = true;
                    // In a real implementation, you would generate a route from employee location to job start
                    // For now, we'll skip the travel phase
                }
            }

            // Create modified route data based on employee modifiers
            const speedMultiplier = parseFloat(employee.speedMultiplier as string) || 1.0;
            const originalRouteData = route.routeData as any;
            
            const modifiedJobRouteData = {
                ...originalRouteData,
                travelTimeSeconds: originalRouteData.travelTimeSeconds / speedMultiplier
            };

            // Use a transaction to ensure consistency
            await db.transaction(async (tx) => {
                // Create active job
                const activeJobId = nanoid();
                await tx.insert(activeJobs).values({
                    id: activeJobId,
                    employeeId: employeeId,
                    jobId: null, // This is an employee-generated route, not a job market job
                    routeToJobId: routeToJobId,
                    jobRouteId: routeId,
                    startTime: new Date(),
                    endTime: null,
                    modifiedRouteToJobData: null, // No travel needed for now
                    modifiedJobRouteData: modifiedJobRouteData,
                    currentPhase: needsTravel ? 'traveling_to_job' : 'on_job',
                    jobPhaseStartTime: needsTravel ? null : new Date()
                });

                // Clear all available routes for this employee
                await tx.update(employees)
                    .set({ 
                        availableRoutes: JSON.stringify([])
                    })
                    .where(eq(employees.id, employeeId));

                // Delete all other available routes from the database since they're no longer valid
                const otherRouteIds = availableRoutes.filter(id => id !== routeId);
                if (otherRouteIds.length > 0) {
                    await tx.delete(routes).where(inArray(routes.id, otherRouteIds));
                }
            });

            return json({ success: true, message: 'Route assigned successfully' });

        } else if (action === 'completeRoute') {
            // This action is now handled automatically by the route completion system
            // But we can keep it for manual completion (cheats, etc.)
            
            // Get the employee's current active job
            const [activeJob] = await db
                .select()
                .from(activeJobs)
                .where(eq(activeJobs.employeeId, employeeId))
                .limit(1);

            if (!activeJob) {
                return error(400, 'Employee is not currently on an active job');
            }

            if (activeJob.endTime) {
                return error(400, 'Job is already completed');
            }

            // Get the job route for reward calculation
            const [jobRoute] = await db
                .select()
                .from(routes)
                .where(eq(routes.id, activeJob.jobRouteId))
                .limit(1);

            if (!jobRoute) {
                return error(404, 'Job route not found');
            }

            // Get the end address for location update
            const [endAddress] = await db
                .select()
                .from(addresses)
                .where(eq(addresses.id, jobRoute.endAddressId))
                .limit(1);

            if (!endAddress) {
                return error(404, 'End address not found');
            }

            // Use a transaction to ensure consistency
            await db.transaction(async (tx) => {
                // Update employee location to end address
                await tx.update(employees)
                    .set({ 
                        location: JSON.stringify({
                            id: endAddress.id,
                            lat: parseFloat(endAddress.lat),
                            lon: parseFloat(endAddress.lon),
                            street: endAddress.street,
                            house_number: endAddress.houseNumber,
                            city: endAddress.city,
                            postcode: endAddress.postcode
                        }),
                        timeRoutesGenerated: null // Clear so new routes can be generated
                    })
                    .where(eq(employees.id, employeeId));

                // Mark the active job as completed
                await tx.update(activeJobs)
                    .set({ endTime: new Date() })
                    .where(eq(activeJobs.id, activeJob.id));

                // Award the job reward to the game state
                const currentMoney = typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money;
                const jobReward = typeof jobRoute.reward === 'string' ? parseFloat(jobRoute.reward) : jobRoute.reward;
                const newMoney = currentMoney + jobReward;
                
                await tx.update(gameStates)
                    .set({ money: newMoney.toString() })
                    .where(eq(gameStates.id, gameStateId));
            });

            const reward = typeof jobRoute.reward === 'string' ? parseFloat(jobRoute.reward) : jobRoute.reward;
            const newBalance = (typeof gameState.money === 'string' ? parseFloat(gameState.money) : gameState.money) + reward;

            return json({ 
                success: true, 
                message: 'Job completed successfully',
                reward: reward,
                newBalance: newBalance
            });

        } else {
            return error(400, 'Invalid action');
        }

    } catch (err) {
        console.error('Error updating employee:', err);
        return error(500, 'Failed to update employee');
    }
}; 