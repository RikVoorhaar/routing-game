import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	gameStates,
	employees,
	activeJobs,
	jobs,
	activeRoutes,
	addresses
} from '$lib/server/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { computeActiveJob } from '$lib/jobs/activeJobComputation';

// GET /api/active-jobs?jobId=123&gameStateId=abc - Get active jobs for a specific job and gameState
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
		const gameState = await db.query.gameStates.findFirst({
			where: and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id))
		});

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get active jobs for this game state
		const activeJobsForGame = await db
			.select()
			.from(activeJobs)
			.where(eq(activeJobs.gameStateId, gameStateId));

		return json(activeJobsForGame);
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
		const gameState = await db.query.gameStates.findFirst({
			where: eq(gameStates.id, gameStateId)
		});

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		// Get the employee and verify ownership
		const employee = await db.query.employees.findFirst({
			where: eq(employees.id, employeeId)
		});

		if (!employee) {
			return error(404, 'Employee not found');
		}

		// Check if active job already exists for this job and employee
		const existingActiveJob = await db.query.activeJobs.findFirst({
			where: and(eq(activeJobs.employeeId, employeeId), eq(activeJobs.jobId, jobId))
		});

		if (existingActiveJob) {
			// Get complete data for existing active job
			const [employeeStartAddress, jobAddress, employeeEndAddress, activeRoute] = await Promise.all(
				[
					db.query.addresses.findFirst({
						where: eq(addresses.id, existingActiveJob.employeeStartAddressId)
					}),
					db.query.addresses.findFirst({ where: eq(addresses.id, existingActiveJob.jobAddressId) }),
					db.query.addresses.findFirst({
						where: eq(addresses.id, existingActiveJob.employeeEndAddressId)
					}),
					db.query.activeRoutes.findFirst({
						where: eq(activeRoutes.activeJobId, existingActiveJob.id)
					})
				]
			);

			return json({
				activeJob: existingActiveJob,
				activeRoute,
				employeeStartAddress,
				jobAddress,
				employeeEndAddress,
				isExisting: true
			});
		}

		// Get the job details
		const job = await db.query.jobs.findFirst({
			where: eq(jobs.id, jobId)
		});

		if (!job) {
			return error(404, 'Job not found');
		}

		// Compute the active job using our new logic
		const { activeJob, activeRoute } = await computeActiveJob(employee, job, gameState);

		// Get the addresses for the computed active job
		const [employeeStartAddress, jobAddress, employeeEndAddress] = await Promise.all([
			db.query.addresses.findFirst({ where: eq(addresses.id, activeJob.employeeStartAddressId) }),
			db.query.addresses.findFirst({ where: eq(addresses.id, activeJob.jobAddressId) }),
			db.query.addresses.findFirst({ where: eq(addresses.id, activeJob.employeeEndAddressId) })
		]);

		// Insert the computed active job and active route into the database
		await db.transaction(async (tx) => {
			await tx.insert(activeJobs).values(activeJob);
			await tx.insert(activeRoutes).values(activeRoute);
		});

		return json({
			activeJob: activeJob,
			activeRoute: activeRoute,
			employeeStartAddress,
			jobAddress,
			employeeEndAddress
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
		const { activeJobId, gameStateId, employeeId } = await request.json();

		if (!activeJobId || !gameStateId) {
			return error(400, 'Active job ID and game state ID are required');
		}

		// Verify the game state belongs to the current user
		const gameState = await db.query.gameStates.findFirst({
			where: and(eq(gameStates.id, gameStateId), eq(gameStates.userId, session.user.id))
		});

		if (!gameState) {
			return error(404, 'Game state not found or access denied');
		}

		const [activeJob, employee] = await Promise.all([
			db.query.activeJobs.findFirst({
				where: eq(activeJobs.id, activeJobId)
			}),
			db.query.employees.findFirst({
				where: and(eq(employees.id, employeeId), eq(employees.gameId, gameStateId))
			})
		]);

		if (!activeJob) {
			return error(404, 'Active job not found');
		}

		if (!employee) {
			return error(404, 'Employee not found');
		}

		const startTime = new Date();

		await db.transaction(async (tx) => {
			// Delete all active jobs for this employee (except the one we're accepting)
			await tx
				.delete(activeJobs)
				.where(
					and(eq(activeJobs.employeeId, activeJob.employeeId), ne(activeJobs.id, activeJob.id))
				);

			// Delete all active jobs for this job from other employees
			if (activeJob.jobId) {
				await tx
					.delete(activeJobs)
					.where(and(eq(activeJobs.jobId, activeJob.jobId), ne(activeJobs.id, activeJob.id)));
			}

			// Update the active job with start time (keep the same ID)
			await tx.update(activeJobs).set({ startTime }).where(eq(activeJobs.id, activeJob.id));
		});

		// Get the updated active job and complete data
		const [updatedActiveJob, employeeStartAddress, jobAddress, employeeEndAddress, activeRoute] =
			await Promise.all([
				db.query.activeJobs.findFirst({
					where: eq(activeJobs.id, activeJob.id)
				}),
				db.query.addresses.findFirst({
					where: eq(addresses.id, activeJob.employeeStartAddressId)
				}),
				db.query.addresses.findFirst({ where: eq(addresses.id, activeJob.jobAddressId) }),
				db.query.addresses.findFirst({
					where: eq(addresses.id, activeJob.employeeEndAddressId)
				}),
				db.query.activeRoutes.findFirst({ where: eq(activeRoutes.activeJobId, activeJob.id) })
			]);

		if (!updatedActiveJob) {
			return error(404, 'Active job not found after update');
		}

		return json({
			activeJob: updatedActiveJob,
			activeRoute,
			employeeStartAddress,
			jobAddress,
			employeeEndAddress
		});
	} catch (err) {
		console.error('Error accepting active job:', err);
		return error(500, 'Failed to accept active job');
	}
};
