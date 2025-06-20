import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { gameStates, employees, routes, activeJobs, addresses, jobs } from '$lib/server/db/schema';
import { eq, and, lt, desc, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { modifyRoute } from '$lib/jobAssignment';
import { getEmployeeMaxSpeed } from '$lib/employeeUtils';

// GET /api/active-jobs?jobId=123&gameStateId=abc - Get active jobs for a specific job
export const GET: RequestHandler = async ({ url, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    const jobId = url.searchParams.get('jobId');
    const gameStateId = url.searchParams.get('gameStateId');

    if (!jobId || !gameStateId) {
        return error(400, 'Job ID and game state ID are required');
    }

    try {
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

        // Clean up old active jobs (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        await db.delete(activeJobs).where(lt(activeJobs.startTime, oneHourAgo));

                 // Clean up excess active jobs (keep only 20 most recent)
         const allActiveJobs = await db
             .select({ id: activeJobs.id })
             .from(activeJobs)
             .orderBy(desc(activeJobs.startTime));
         
         if (allActiveJobs.length > 20) {
             const jobsToDelete = allActiveJobs.slice(20);
             for (const job of jobsToDelete) {
                 await db.delete(activeJobs).where(eq(activeJobs.id, job.id));
             }
         }

        // Get active jobs for this specific job
        const activeJobsForJob = await db
            .select({
                activeJob: activeJobs,
                employee: employees
            })
            .from(activeJobs)
            .innerJoin(employees, eq(activeJobs.employeeId, employees.id))
            .where(eq(activeJobs.jobId, parseInt(jobId)))
            .orderBy(desc(activeJobs.startTime));

        return json(activeJobsForJob);
    } catch (err) {
        console.error('Error fetching active jobs:', err);
        return error(500, 'Failed to fetch active jobs');
    }
};

// POST /api/active-jobs - Create a new active job (compute route and store)
export const POST: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { employeeId, jobId, gameStateId } = await request.json();
        
        if (!employeeId || !jobId || !gameStateId) {
            return error(400, 'Employee ID, job ID, and game state ID are required');
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

        // Check if active job already exists for this job and employee
        const [existingActiveJob] = await db
            .select()
            .from(activeJobs)
            .where(
                and(
                    eq(activeJobs.employeeId, employeeId),
                    eq(activeJobs.jobId, jobId)
                )
            )
            .limit(1);

        if (existingActiveJob) {
            // Return existing active job
            return json({ activeJob: existingActiveJob, isExisting: true });
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
                // TODO: Generate route from employee location to job start
                // For now, we'll skip the travel phase
            }
        }

        // Create modified route data based on employee modifiers
        const originalRouteData = job.route.routeData as any;
        const modifiedJobRouteData = modifyRoute(originalRouteData, employee);

        // Calculate total travel time and payout
        const basePayout = parseFloat(job.route.reward);
        const totalTravelTime = modifiedJobRouteData.travelTimeSeconds || 0;

        // Create the active job
        const activeJobId = nanoid();
        const newActiveJob = {
            id: activeJobId,
            employeeId: employeeId,
            jobId: jobId,
            routeToJobId: routeToJobId,
            jobRouteId: job.route.id,
            startTime: new Date(),
            endTime: null,
            modifiedRouteToJobData: null, // No travel needed for now
            modifiedJobRouteData: modifiedJobRouteData,
            currentPhase: needsTravel ? 'traveling_to_job' : 'on_job' as const,
            jobPhaseStartTime: needsTravel ? null : new Date()
        };

        await db.insert(activeJobs).values(newActiveJob);

        return json({
            activeJob: newActiveJob,
            totalTravelTime,
            computedPayout: basePayout,
            isExisting: false
        });

    } catch (err) {
        console.error('Error creating active job:', err);
        return error(500, 'Failed to create active job');
    }
};

// PUT /api/active-jobs - Accept/start an active job
export const PUT: RequestHandler = async ({ request, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    try {
        const { activeJobId, gameStateId } = await request.json();
        
        if (!activeJobId || !gameStateId) {
            return error(400, 'Active job ID and game state ID are required');
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

        // Get the active job
        const [activeJob] = await db
            .select()
            .from(activeJobs)
            .where(eq(activeJobs.id, activeJobId))
            .limit(1);

        if (!activeJob) {
            return error(404, 'Active job not found');
        }

        // Get the employee
        const [employee] = await db
            .select()
            .from(employees)
            .where(
                and(
                    eq(employees.id, activeJob.employeeId),
                    eq(employees.gameId, gameStateId)
                )
            )
            .limit(1);

        if (!employee) {
            return error(404, 'Employee not found');
        }

        // Use a transaction to ensure consistency
        await db.transaction(async (tx) => {
                         // Drop all other active jobs for this employee
             await tx.delete(activeJobs).where(
                 and(
                     eq(activeJobs.employeeId, activeJob.employeeId),
                     ne(activeJobs.id, activeJobId) // Don't delete this one
                 )
             );

            // Drop all active jobs for this job from other employees of the same user
            if (activeJob.jobId) {
                const otherEmployees = await tx
                    .select({ id: employees.id })
                    .from(employees)
                    .where(eq(employees.gameId, gameStateId));
                
                const otherEmployeeIds = otherEmployees.map(emp => emp.id);
                
                                 await tx.delete(activeJobs).where(
                     and(
                         eq(activeJobs.jobId, activeJob.jobId),
                         ne(activeJobs.id, activeJobId) // Don't delete this one
                     )
                 );
            }

            // Update the active job start time to now
            await tx.update(activeJobs)
                .set({ 
                    startTime: new Date(),
                    jobPhaseStartTime: new Date()
                })
                .where(eq(activeJobs.id, activeJobId));

            // Update the employee to indicate which job they're completing
            await tx.update(employees)
                .set({ activeJobId: activeJobId })
                .where(eq(employees.id, activeJob.employeeId));

            // Remove the job from the job market (it's now taken)
            if (activeJob.jobId) {
                await tx.delete(jobs).where(eq(jobs.id, activeJob.jobId));
            }
        });

        return json({ success: true, message: 'Job accepted successfully' });

    } catch (err) {
        console.error('Error accepting active job:', err);
        return error(500, 'Failed to accept active job');
    }
}; 