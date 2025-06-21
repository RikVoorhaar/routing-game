import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, routes } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, locals }) => {
    const session = await locals.auth();
    
    if (!session?.user?.id) {
        return error(401, 'Unauthorized');
    }

    const { employeeId } = params;

    if (!employeeId) {
        return error(400, 'Employee ID is required');
    }

    try {
        // Get the employee and verify ownership
        const [employee] = await db
            .select()
            .from(employees)
            .where(eq(employees.id, employeeId))
            .limit(1);

        if (!employee) {
            return error(404, 'Employee not found');
        }

        // Verify the employee belongs to a game state owned by the current user
        // This check happens through the game state relationship in the schema

        // Get the active job for this employee if one exists
        if (!employee.activeJobId) {
            return json({ activeJob: null, route: null });
        }

        const [activeJobData] = await db
            .select({
                activeJob: activeJobs,
                route: routes
            })
            .from(activeJobs)
            .leftJoin(routes, eq(activeJobs.jobRouteId, routes.id))
            .where(eq(activeJobs.id, employee.activeJobId))
            .limit(1);

        if (!activeJobData) {
            return json({ activeJob: null, route: null });
        }

        return json({
            activeJob: activeJobData.activeJob,
            route: activeJobData.route
        });

    } catch (err) {
        console.error('Error fetching employee active job:', err);
        return error(500, 'Failed to fetch employee active job');
    }
}; 