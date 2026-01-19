/**
 * Deterministic Random Number Generator using Mulberry32
 * 
 * This module provides a deterministic RNG that produces reproducible results
 * for identical seed + datum combinations. The Mulberry32 algorithm is used
 * for its simplicity and speed, making it ideal for game logic.
 */

/**
 * Mulberry32 PRNG - simple and fast 32-bit generator
 * @param seed - Initial seed value (will be mutated)
 * @returns Next random number in [0, 1)
 */
function mulberry32(seed: number): number {
	let t = (seed += 0x6d2b79f5);
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Convert datum to a deterministic integer value
 * - Numbers are used directly (converted to 32-bit unsigned)
 * - Strings and objects are hashed using a simple string hash
 */
function datumToInt(datum: string | number | object): number {
	if (typeof datum === 'number') {
		// Use number directly, ensure it's a 32-bit unsigned integer
		return (datum >>> 0);
	}
	
	// For strings and objects, use a simple hash
	const str = typeof datum === 'string' ? datum : JSON.stringify(datum);
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return hash >>> 0; // Ensure unsigned
}

/**
 * Generate a deterministic random number in [0, 1) from seed + datum
 * 
 * This function combines the seed and datum into a single initial state,
 * then uses Mulberry32 to generate a random number. The same seed + datum
 * combination will always produce the same result.
 * 
 * @param seed - The game state seed (integer)
 * @param datum - Input value (can be string, number, or object that gets stringified)
 * @returns Random number in [0, 1)
 * 
 * @example
 * ```typescript
 * const r1 = generate(12345, 'job-1');
 * const r2 = generate(12345, 'job-1');
 * // r1 === r2 (deterministic)
 * 
 * const r3 = generate(12345, 'job-2');
 * // r3 !== r1 (different datum produces different result)
 * ```
 */
export function generate(seed: number, datum: string | number | object): number {
	// Convert datum to integer (numbers used directly, strings/objects hashed)
	const datumInt = datumToInt(datum);
	// XOR seed and datum integer, then ensure unsigned
	const combinedSeed = (seed ^ datumInt) >>> 0;
	// Use a copy to avoid mutating the original seed
	return mulberry32(combinedSeed);
}
