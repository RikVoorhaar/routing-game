import { json } from '@sveltejs/kit';
import { completeActiveJob } from '$lib/jobs/jobCompletion';
import { log } from '$lib/logger';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const { employeeId } = params;

	try {
		const { activeJobId } = await request.json();

		if (!activeJobId) {
			return json({ message: 'Active job ID is required' }, { status: 400 });
		}

		// Job completion is logged at info level in completeActiveJob function
		const result = await completeActiveJob(activeJobId);

		return json({
			success: true,
			employee: result.employee,
			gameState: result.gameState,
			reward: result.reward,
			newBalance: result.newBalance
		});
	} catch (error) {
		log.api.error({
			event: 'job.complete.error',
			employee_id: employeeId,
			active_job_id: activeJobId,
			err: error instanceof Error ? {
				name: error.name,
				message: error.message,
				stack: error.stack
			} : error
		}, 'Error completing job');
		const message = error instanceof Error ? error.message : 'Failed to complete job';
		return json({ message }, { status: 500 });
	}
};
