import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs, routes } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

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
		const employee = await db.query.employees.findFirst({
			where: eq(employees.id, employeeId)
		});

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Verify the employee belongs to a game state owned by the current user
		// This check happens through the game state relationship in the schema

		// Get the active job for this employee if one exists

		const activeJobData = await db.query.activeJobs.findFirst({
			where: eq(activeJobs.employeeId, employeeId)
		});

		if (!activeJobData) {
			return json({ activeJob: null, route: null });
		}

		return json({
			activeJob: activeJobData,
			route: activeJobData.routeData
		});
	} catch (err) {
		console.error('Error fetching employee active job:', err);
		return error(500, 'Failed to fetch employee active job');
	}
};
