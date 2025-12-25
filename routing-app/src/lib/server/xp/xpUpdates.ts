import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { JobCategory } from '../../jobs/jobCategories';

/**
 * Compute XP gain after applying multiplier
 *
 * Parameters
 * -----------
 * baseXp: number
 *     Base XP value (before multiplier)
 * xpMultiplier: number
 *     Multiplier to apply (defaults to 1 if not provided or invalid)
 *
 * Returns
 * --------
 * number
 *     Floored XP gain after applying multiplier
 */
export function computeXpGain(baseXp: number, xpMultiplier: number = 1): number {
	if (baseXp < 0) {
		return 0;
	}
	if (xpMultiplier < 0) {
		// Clamp negative multipliers to 0 (no XP gain)
		return 0;
	}
	return Math.floor(baseXp * xpMultiplier);
}

/**
 * Build a Drizzle SQL expression to atomically increment a category XP value in a JSONB field
 *
 * This uses PostgreSQL's jsonb_set with COALESCE to handle missing keys atomically.
 * The expression: jsonb_set(xp, '{category}', (COALESCE((xp->>'category')::int, 0) + delta)::text::jsonb)
 *
 * Parameters
 * -----------
 * baseXpJsonb: SQL | any
 *     The JSONB column reference (e.g., gameStates.xp)
 * categoryKey: string
 *     The category key (as string, e.g., "0" for JobCategory.GROCERIES)
 * delta: number
 *     The XP amount to add
 *
 * Returns
 * --------
 * SQL
 *     Drizzle SQL expression for atomic JSONB increment
 */
export function buildCategoryXpIncrementExpr(
	baseXpJsonb: SQL | any,
	categoryKey: string,
	delta: number
): SQL {
	// Use jsonb_set to atomically update the category XP
	// COALESCE handles missing keys by defaulting to 0
	// Cast to int, add delta, then cast back to jsonb
	return sql`jsonb_set(
		${baseXpJsonb},
		ARRAY[${categoryKey}],
		((COALESCE((${baseXpJsonb}->>${categoryKey})::int, 0) + ${delta})::text)::jsonb
	)`;
}

/**
 * Build a Drizzle SQL expression to atomically increment multiple category XP values in a JSONB field
 *
 * This nests multiple jsonb_set calls to update all categories in a single UPDATE statement.
 * The expression: jsonb_set(jsonb_set(xp, '{cat1}', ...), '{cat2}', ...)
 *
 * Parameters
 * -----------
 * baseXpJsonb: SQL | any
 *     The JSONB column reference (e.g., gameStates.xp)
 * deltas: Record<string, number>
 *     Map of category keys (as strings) to XP deltas
 *
 * Returns
 * --------
 * SQL
 *     Drizzle SQL expression for atomic multi-category JSONB increment
 */
export function buildMultiCategoryXpIncrementExpr(
	baseXpJsonb: SQL | any,
	deltas: Record<string, number>
): SQL {
	// If no deltas, return the original JSONB unchanged
	if (Object.keys(deltas).length === 0) {
		return sql`${baseXpJsonb}`;
	}

	// Build nested jsonb_set calls for each category
	// Start with the base JSONB and nest each update
	let expr: SQL = baseXpJsonb;

	for (const [categoryKey, delta] of Object.entries(deltas)) {
		if (delta !== 0) {
			// Only add updates for non-zero deltas
			expr = buildCategoryXpIncrementExpr(expr, categoryKey, delta);
		}
	}

	return expr;
}
