import type { ActiveJob, Job, GameState } from '$lib/server/db/schema';
import type { GameConfig } from '$lib/config/types';

/**
 * Compute the single unified XP value for a job
 *
 * Parameters
 * -----------
 * job: Job
 *     The job to compute XP for
 * config: GameConfig
 *     Game configuration containing XP rates and multipliers
 * gameState: GameState
 *     Current game state containing upgrade effects (including xpMultiplier)
 *
 * Returns
 * --------
 * number
 *     The computed XP value (includes dev multiplier and upgrade multiplier)
 */
export function computeJobXp(job: Job, config: GameConfig, gameState: GameState): number {
	// Previously we had two XP values:
	// - drivingXp: based on time
	// - categoryXp: based on value
	//
	// We now store a single XP value on the active job. To keep overall progression
	// roughly stable (total XP across employee+category), we use the *average* of the
	// two previous components and then award that same XP to both employee XP and
	// global category XP on completion.
	const timeComponent = job.approximateTimeSeconds * config.xp.driving.perSecond;
	const valueComponent = job.approximateValue * config.xp.category.perEuro;
	const combined = timeComponent + valueComponent;
	const baseXp = Math.floor((combined * config.dev.xpMultiplier) / 2);
	
	// Apply upgrade multiplier from gameState
	const xpMultiplier = gameState.upgradeEffects?.xpMultiplier ?? 1;
	const finalXp = Math.floor(baseXp * xpMultiplier);
	
	return finalXp;
}

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
