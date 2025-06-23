import { json } from '@sveltejs/kit';
import { completeActiveJob } from '$lib/server/jobCompletion';
import { log } from '$lib/logger';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const { employeeId } = params;

	try {
		const { activeJobId } = await request.json();

		if (!activeJobId) {
			return json({ message: 'Active job ID is required' }, { status: 400 });
		}

		log.debug('[CompleteJob] Completing job for employee:', employeeId, 'job:', activeJobId);

		const result = await completeActiveJob(employeeId, activeJobId);

		log.debug('[CompleteJob] Job completed successfully. Reward:', result.reward);

		return json({
			success: true,
			employee: result.employee,
			gameState: result.gameState,
			reward: result.reward,
			newBalance: result.newBalance
		});
	} catch (error) {
		log.error('[CompleteJob] Error completing job:', error);
		const message = error instanceof Error ? error.message : 'Failed to complete job';
		return json({ message }, { status: 500 });
	}
};
