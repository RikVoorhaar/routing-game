import { db } from '../db';
import { gameStates } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { GameState } from '../db/schema';
import { UPGRADE_DEFINITIONS } from '$lib/upgrades/upgradeDefinitions';
import { checkLevelRequirements, checkUpgradeRequirements } from '../../upgrades/upgradeUtils';
import { applyUpgradeEffect } from './upgradeUtils';
import { log } from '$lib/logger';

/**
 * Build a Drizzle SQL expression to atomically update a JSONB field with a new value
 *
 * Parameters
 * -----------
 * baseJsonb: SQL | any
 *     The JSONB column reference (e.g., gameStates.upgradeEffects)
 * key: string
 *     The key to update in the JSONB object
 * newValue: number
 *     The new value to set
 *
 * Returns
 * --------
 * SQL
 *     Drizzle SQL expression for atomic JSONB update
 */
function buildJsonbSetExpr(baseJsonb: SQL | any, key: string, newValue: number): SQL {
	return sql`jsonb_set(
		${baseJsonb},
		ARRAY[${key}],
		${newValue}::text::jsonb
	)`;
}

/**
 * Purchase a global upgrade for a game state
 *
 * Parameters
 * -----------
 * gameStateId: string
 *     The ID of the game state to purchase the upgrade for
 * upgradeId: string
 *     The ID of the upgrade to purchase
 * userId: string
 *     The ID of the user (for ownership verification)
 *
 * Returns
 * --------
 * Promise<GameState>
 *     The updated game state after purchase
 *
 * Throws
 * ------
 * Error if upgrade doesn't exist, already purchased, requirements not met, insufficient funds, or ownership mismatch
 */
export async function purchaseUpgrade(
	gameStateId: string,
	upgradeId: string,
	userId: string
): Promise<GameState> {
	log.debug('[UpgradePurchase] Starting purchase:', { gameStateId, upgradeId, userId });

	// Find the upgrade definition
	const upgrade = UPGRADE_DEFINITIONS.find((u) => u.id === upgradeId);
	if (!upgrade) {
		throw new Error(`Upgrade not found: ${upgradeId}`);
	}

	return await db.transaction(async (tx) => {
		// Lock the game state row for update
		const [lockedGameState] = await tx
			.select()
			.from(gameStates)
			.where(and(eq(gameStates.id, gameStateId), eq(gameStates.userId, userId)))
			.for('update')
			.limit(1);

		if (!lockedGameState) {
			throw new Error('Game state not found or access denied');
		}

		// Check if upgrade has already been purchased
		if (lockedGameState.upgradesPurchased.includes(upgradeId)) {
			throw new Error(`Upgrade already purchased: ${upgradeId}`);
		}

		// Check upgrade requirements (dependencies)
		if (!checkUpgradeRequirements(lockedGameState.upgradesPurchased, upgrade.upgradeRequirements)) {
			const missing = upgrade.upgradeRequirements.filter(
				(id) => !lockedGameState.upgradesPurchased.includes(id)
			);
			throw new Error(`Upgrade requirements not met. Missing: ${missing.join(', ')}`);
		}

		// Check level requirements
		if (!checkLevelRequirements(lockedGameState, upgrade.levelRequirements)) {
			throw new Error('Level requirements not met');
		}

		// Check sufficient money
		if (lockedGameState.money < upgrade.cost) {
			throw new Error(
				`Insufficient funds. Required: ${upgrade.cost}, Available: ${lockedGameState.money}`
			);
		}

		// Apply the upgrade effect to calculate new upgradeEffects
		const currentEffects = lockedGameState.upgradeEffects || {};
		const newEffects = applyUpgradeEffect(currentEffects, upgrade.effect, upgrade.effectArguments);

		// Build SQL expression for updating upgradeEffects JSONB
		// We need to update each effect key that changed or is new
		let effectsExpr: SQL = sql`${gameStates.upgradeEffects}`;
		for (const [key, value] of Object.entries(newEffects)) {
			const currentValue = currentEffects[key as keyof typeof currentEffects];
			// Update if value changed or is new (undefined in current)
			if (value !== currentValue) {
				effectsExpr = buildJsonbSetExpr(effectsExpr, key, value);
			}
		}

		// Atomically update: deduct money, add upgrade ID to array, update effects
		// Use PostgreSQL array concatenation operator || to append the upgrade ID
		const [updatedGameState] = await tx
			.update(gameStates)
			.set({
				money: sql`${gameStates.money} - ${upgrade.cost}`,
				upgradesPurchased: sql`${gameStates.upgradesPurchased} || ARRAY[${sql.raw(`'${upgradeId.replace(/'/g, "''")}'`)}]::text[]`,
				upgradeEffects: effectsExpr
			})
			.where(eq(gameStates.id, gameStateId))
			.returning();

		if (!updatedGameState) {
			throw new Error('Failed to update game state');
		}

		log.debug('[UpgradePurchase] Purchase successful:', {
			upgradeId,
			cost: upgrade.cost,
			newBalance: updatedGameState.money
		});

		return updatedGameState;
	});
}
