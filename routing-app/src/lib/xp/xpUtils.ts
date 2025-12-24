/**
 * XP Utilities - Runescape-style leveling system
 * 
 * Uses the formula: XP(n → n+1) = floor((n + 300 * 2^(n/7)) / 4)
 * Pre-calculates a lookup table (LOT) for levels 0-120 for performance.
 */

/**
 * Calculate XP required to go from level n to n+1
 * Formula: floor((n + 300 * 2^(n/7)) / 4)
 * 
 * Parameters
 * ----------
 * level: number
 *     The current level (n)
 * 
 * Returns
 * -------
 * number
 *     XP required to reach level n+1 from level n
 */
function calculateXpForNextLevel(level: number): number {
	return Math.floor((level + 300 * Math.pow(2, level / 7)) / 4);
}

/**
 * Pre-calculated lookup table of cumulative XP requirements
 * LOT[n] = total XP needed to reach level n
 * LOT[0] = 0 (starting point)
 */
const XP_LOOKUP_TABLE: readonly number[] = (() => {
	const table: number[] = [0]; // Level 0 requires 0 XP
	let cumulativeXp = 0;
	
	for (let level = 0; level < 120; level++) {
		const xpForNextLevel = calculateXpForNextLevel(level);
		cumulativeXp += xpForNextLevel;
		table.push(cumulativeXp);
	}
	
	return Object.freeze(table);
})();

/**
 * Maximum level supported by the lookup table
 */
export const MAX_LEVEL = 120;

/**
 * Get cumulative XP required to reach a specific level
 * 
 * Parameters
 * ----------
 * level: number
 *     The target level (0-120)
 * 
 * Returns
 * -------
 * number
 *     Cumulative XP required to reach the level
 * 
 * Throws
 * ------
 * Error if level is out of range
 */
export function getXpForLevel(level: number): number {
	if (level < 0 || level > MAX_LEVEL) {
		throw new Error(`Level must be between 0 and ${MAX_LEVEL}, got ${level}`);
	}
	return XP_LOOKUP_TABLE[level];
}

/**
 * Get XP needed to go from currentLevel to currentLevel+1
 * 
 * Parameters
 * ----------
 * currentLevel: number
 *     The current level (0-119)
 * 
 * Returns
 * -------
 * number
 *     XP needed to reach the next level
 * 
 * Throws
 * ------
 * Error if currentLevel is out of range
 */
export function getXpForNextLevel(currentLevel: number): number {
	if (currentLevel < 0 || currentLevel >= MAX_LEVEL) {
		throw new Error(`Current level must be between 0 and ${MAX_LEVEL - 1}, got ${currentLevel}`);
	}
	return calculateXpForNextLevel(currentLevel);
}

/**
 * Calculate current level from total XP using binary search on lookup table
 * 
 * Parameters
 * ----------
 * xp: number
 *     Total XP amount
 * 
 * Returns
 * -------
 * number
 *     The current level (0-120)
 */
export function getLevelFromXp(xp: number): number {
	if (xp < 0) {
		return 0;
	}
	
	// If XP exceeds max level, return max level
	if (xp >= XP_LOOKUP_TABLE[MAX_LEVEL]) {
		return MAX_LEVEL;
	}
	
	// Binary search for the correct level
	let left = 0;
	let right = MAX_LEVEL;
	
	while (left < right) {
		const mid = Math.floor((left + right + 1) / 2);
		if (XP_LOOKUP_TABLE[mid] <= xp) {
			left = mid;
		} else {
			right = mid - 1;
		}
	}
	
	return left;
}

/**
 * Calculate remaining XP needed to reach the next level
 * 
 * Parameters
 * ----------
 * currentXp: number
 *     Current total XP
 * currentLevel: number
 *     Current level (optional, will be calculated if not provided)
 * 
 * Returns
 * -------
 * number
 *     Remaining XP needed to reach the next level, or 0 if already at max level
 */
export function getXpToNextLevel(currentXp: number, currentLevel?: number): number {
	const level = currentLevel ?? getLevelFromXp(currentXp);
	
	if (level >= MAX_LEVEL) {
		return 0; // Already at max level
	}
	
	const xpForNextLevel = getXpForLevel(level + 1);
	return Math.max(0, xpForNextLevel - currentXp);
}

/**
 * Get the lookup table (read-only access)
 * Mainly for testing purposes
 * 
 * Returns
 * -------
 * readonly number[]
 *     The XP lookup table
 */
export function getLookupTable(): readonly number[] {
	return XP_LOOKUP_TABLE;
}

