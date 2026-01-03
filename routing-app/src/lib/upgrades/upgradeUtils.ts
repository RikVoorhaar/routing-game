import type { GameState } from '../server/db/schema';
import type { LevelRequirements } from '../config/types';
import { getLevelFromXp } from '../xp/xpUtils';
import { JobCategory } from '../jobs/jobCategories';

/**
 * Check if level requirements are met for an upgrade
 *
 * Parameters
 * -----------
 * gameState: GameState
 *     The game state containing XP data
 * requirements: LevelRequirements
 *     The level requirements to check (total and/or category-specific)
 *
 * Returns
 * --------
 * boolean
 *     True if all level requirements are met
 */
export function checkLevelRequirements(
	gameState: GameState,
	requirements: LevelRequirements
): boolean {
	const categoryXp = gameState.xp || {};

	// Check total level requirement
	if (requirements.total !== undefined) {
		// Calculate total XP by summing all category XP values
		const totalXp = Object.values(categoryXp).reduce((sum, xp) => sum + (xp || 0), 0);
		const totalLevel = getLevelFromXp(totalXp);

		if (totalLevel < requirements.total) {
			return false;
		}
	}

	// Check category-specific level requirements
	// Category keys are JobCategory enum names (e.g., "FURNITURE", "PEOPLE", "GROCERIES")
	for (const [key, requiredLevel] of Object.entries(requirements)) {
		if (key === 'total') {
			continue; // Already checked above
		}

		if (requiredLevel === undefined) {
			continue;
		}

		// Look up the enum value from the enum key
		const categoryNum = JobCategory[key as keyof typeof JobCategory];
		if (categoryNum === undefined) {
			// Invalid category key - skip it (could throw error, but being lenient for now)
			continue;
		}

		const categoryXpValue = categoryXp[categoryNum] || 0;
		const categoryLevel = getLevelFromXp(categoryXpValue);

		if (categoryLevel < requiredLevel) {
			return false;
		}
	}

	return true;
}

/**
 * Check if upgrade requirements (dependencies) are met
 *
 * Parameters
 * -----------
 * purchased: string[]
 *     Array of upgrade IDs that have already been purchased
 * required: string[]
 *     Array of upgrade IDs that must be purchased first
 *
 * Returns
 * --------
 * boolean
 *     True if all required upgrades have been purchased
 */
export function checkUpgradeRequirements(purchased: string[], required: string[]): boolean {
	if (required.length === 0) {
		return true; // No requirements
	}

	const purchasedSet = new Set(purchased);
	return required.every((upgradeId) => purchasedSet.has(upgradeId));
}
