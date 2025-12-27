import type { GameState } from '../db/schema';
import type {
	LevelRequirements,
	UpgradeEffectType,
	UpgradeEffectArguments
} from '$lib/config/types';
import type { UpgradeEffects } from '../db/schema';
import { getLevelFromXp } from '$lib/xp/xpUtils';
import { JobCategory } from '$lib/jobs/jobCategories';

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

/**
 * Apply an upgrade effect to the current upgrade effects object
 *
 * Parameters
 * -----------
 * currentEffects: UpgradeEffects
 *     The current upgrade effects object
 * effect: UpgradeEffectType
 *     The type of effect to apply ('multiply' or 'increment')
 * args: UpgradeEffectArguments
 *     The effect arguments containing the effect name and amount
 *
 * Returns
 * --------
 * UpgradeEffects
 *     A new upgrade effects object with the effect applied
 */
export function applyUpgradeEffect(
	currentEffects: UpgradeEffects,
	effect: UpgradeEffectType,
	args: UpgradeEffectArguments
): UpgradeEffects {
	const effectName = args.name as keyof UpgradeEffects;
	const amount = args.amount;

	// Create a copy of current effects
	const newEffects: UpgradeEffects = { ...currentEffects };

	if (effect === 'multiply') {
		// For multiply effects, default to 1 if not present
		const currentValue = newEffects[effectName] ?? 1;
		newEffects[effectName] = currentValue * amount;
	} else if (effect === 'increment') {
		// For increment effects, default to 0 if not present
		const currentValue = newEffects[effectName] ?? 0;
		newEffects[effectName] = currentValue + amount;
	} else {
		throw new Error(`Unknown effect type: ${effect}`);
	}

	return newEffects;
}
