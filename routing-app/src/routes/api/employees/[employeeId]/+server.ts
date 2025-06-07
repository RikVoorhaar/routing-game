import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, gameStates } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

// GET /api/employees/[employeeId] - Get a specific employee
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
        // Get the employee and verify ownership through game state
        const [employee] = await db
            .select({
                employee: employees,
                gameState: gameStates
            })
            .from(employees)
            .innerJoin(gameStates, eq(employees.gameId, gameStates.id))
            .where(
                and(
                    eq(employees.id, employeeId),
                    eq(gameStates.userId, session.user.id)
                )
            )
            .limit(1);

        if (!employee) {
            return error(404, 'Employee not found or access denied');
        }

        return json(employee.employee);
    } catch (err) {
        console.error('Error fetching employee:', err);
        return error(500, 'Failed to fetch employee');
    }
}; 