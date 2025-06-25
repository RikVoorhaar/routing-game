import type { ActiveJob } from '$lib/server/db/schema';

/* 
Compute the job progress as percentage of the job duration

If the job is completed, return 100%
If the job is not started, return 0%
If the job is in progress, return the percentage of the job duration that has elapsed as number between 0 and 100
and the time left in milliseconds
*/
export function getJobProgress(activeJob: ActiveJob): {
	progressPercent: number;
	timeLeftMs: number | null;
} {
	if (activeJob.startTime === null) {
		return { progressPercent: 0, timeLeftMs: null };
	}
	const startTime = new Date(activeJob.startTime!).getTime();
	const currentTime = Date.now();
	const duration = activeJob.durationSeconds * 1000;
	const elapsed = currentTime - startTime;
	return {
		progressPercent: Math.min(100, (elapsed / duration) * 100),
		timeLeftMs: Math.max(0, duration - elapsed)
	};
}
