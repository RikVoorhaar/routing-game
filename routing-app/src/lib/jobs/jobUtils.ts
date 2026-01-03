import type { Job, GameState } from '$lib/server/db/schema';
import type { GameConfig } from '$lib/config/types';

/**
 * Compute the reward/payout for a job based on distance only
 *
 * Parameters
 * -----------
 * totalDistanceKm: number
 *     Total distance of the job in kilometers
 * config: GameConfig
 *     Game configuration containing value factors and multipliers
 * gameState: GameState
 *     Current game state containing upgrade effects (including moneyDistanceFactor)
 *
 * Returns
 * --------
 * number
 *     The computed reward value (includes dev money multiplier and upgrade multipliers)
 */
export function computeJobReward(
	totalDistanceKm: number,
	config: GameConfig,
	gameState: GameState
): number {
	const baseReward = totalDistanceKm * config.jobs.value.distanceFactor;

	// Apply moneyDistanceFactor upgrade multiplier from gameState
	const moneyDistanceFactor = gameState.upgradeEffects?.moneyDistanceFactor ?? 1;

	return baseReward * moneyDistanceFactor * config.dev.moneyMultiplier;
}

/**
 * Compute the single unified XP value for a job (distance-only)
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
 *     Note: XP is based on distance only, not reward, so money multipliers don't affect XP
 */
export function computeJobXp(job: Job, config: GameConfig, gameState: GameState): number {
	// XP is calculated directly from distance, not from reward
	// This ensures money multipliers don't affect XP gains
	// Formula: baseXp = totalDistanceKm * distanceFactor * perEuro * dev.xpMultiplier
	const baseXp =
		job.totalDistanceKm *
		config.jobs.value.distanceFactor *
		config.xp.category.perEuro *
		config.dev.xpMultiplier;

	// Apply upgrade multiplier from gameState
	const xpMultiplier = gameState.upgradeEffects?.xpMultiplier ?? 1;
	const finalXp = Math.floor(baseXp * xpMultiplier);

	return finalXp;
}
