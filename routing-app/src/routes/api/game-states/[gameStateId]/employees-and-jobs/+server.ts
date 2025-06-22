import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { employees, activeJobs } from '$lib/server/db/schema';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';
import { processCompletedJobs } from '$lib/server/jobCompletion';
import { log } from '$lib/logger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { gameStateId } = params;
	
	try {
		log.debug('[EmployeesAndJobs] Loading data for game state:', gameStateId);
		
		// First, process any completed jobs
		const completionResult = await processCompletedJobs(gameStateId);
		
		if (completionResult.processedJobs > 0) {
			log.debug('[EmployeesAndJobs] Processed', completionResult.processedJobs, 'completed jobs');
		}
		
		// Get all employees for this game state
		const allEmployees = await db
			.select()
			.from(employees)
			.where(eq(employees.gameId, gameStateId));
		
		// Get all active jobs for employees in this game state
		const activeJobsData = await db
			.select({
				activeJob: activeJobs,
				employeeId: employees.id
			})
			.from(activeJobs)
			.innerJoin(employees, eq(activeJobs.employeeId, employees.id))
			.where(
				and(
					eq(employees.gameId, gameStateId),
					isNotNull(activeJobs.startTime),
					isNull(activeJobs.endTime) // Only get incomplete jobs
				)
			);
		
		// Format active jobs by employee ID
		const employeeActiveJobs = allEmployees.map(employee => ({
			employeeId: employee.id,
			activeJob: activeJobsData.find(aj => aj.employeeId === employee.id)?.activeJob || null
		}));
		
		log.debug('[EmployeesAndJobs] Loaded', allEmployees.length, 'employees and', 
		         employeeActiveJobs.filter(eaj => eaj.activeJob).length, 'active jobs');
		
		return json({
			success: true,
			employees: allEmployees,
			employeeActiveJobs,
			gameState: completionResult.updatedGameState,
			processedJobs: completionResult.processedJobs,
			totalReward: completionResult.totalReward
		});
	} catch (error) {
		log.error('[EmployeesAndJobs] Error loading data:', error);
		const message = error instanceof Error ? error.message : 'Failed to load employee data';
		return json({ message }, { status: 500 });
	}
}; 