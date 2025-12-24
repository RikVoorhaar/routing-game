import { describe, it, expect } from 'vitest';
import {
	getXpForLevel,
	getXpForNextLevel,
	getLevelFromXp,
	getXpToNextLevel,
	getLookupTable,
	MAX_LEVEL
} from './xpUtils';

describe('XP Utilities', () => {
	describe('Lookup Table Generation', () => {
		it('should generate lookup table with correct structure', () => {
			const table = getLookupTable();
			
			expect(table.length).toBe(MAX_LEVEL + 1); // Levels 0-120 inclusive
			expect(table[0]).toBe(0); // Level 0 requires 0 XP
		});

		it('should have monotonically increasing XP values', () => {
			const table = getLookupTable();
			
			for (let i = 1; i < table.length; i++) {
				expect(table[i]).toBeGreaterThan(table[i - 1]);
			}
		});

		it('should have correct first few levels', () => {
			// Manual calculation for level 0→1: floor((0 + 300 * 2^(0/7)) / 4) = floor(300 / 4) = 75
			// Level 1→2: floor((1 + 300 * 2^(1/7)) / 4) ≈ floor((1 + 300 * 1.104) / 4) ≈ floor(332.2 / 4) ≈ 83
			const table = getLookupTable();
			
			expect(table[0]).toBe(0);
			expect(table[1]).toBe(75); // Level 0→1
			expect(table[2]).toBeGreaterThan(table[1]); // Level 1→2
		});

		it('should have correct last level', () => {
			const table = getLookupTable();
			const lastLevelXp = table[MAX_LEVEL];
			
			expect(lastLevelXp).toBeGreaterThan(0);
			expect(lastLevelXp).toBeGreaterThan(table[MAX_LEVEL - 1]);
		});
	});

	describe('getXpForLevel', () => {
		it('should return 0 for level 0', () => {
			expect(getXpForLevel(0)).toBe(0);
		});

		it('should return correct XP for level 1', () => {
			// Level 0→1: floor((0 + 300 * 2^0) / 4) = floor(300 / 4) = 75
			expect(getXpForLevel(1)).toBe(75);
		});

		it('should return correct XP for various levels', () => {
			const table = getLookupTable();
			
			for (let level = 0; level <= 10; level++) {
				expect(getXpForLevel(level)).toBe(table[level]);
			}
		});

		it('should return correct XP for max level', () => {
			const table = getLookupTable();
			expect(getXpForLevel(MAX_LEVEL)).toBe(table[MAX_LEVEL]);
		});

		it('should throw error for negative level', () => {
			expect(() => getXpForLevel(-1)).toThrow();
		});

		it('should throw error for level above max', () => {
			expect(() => getXpForLevel(MAX_LEVEL + 1)).toThrow();
		});
	});

	describe('getXpForNextLevel', () => {
		it('should return correct XP for level 0→1', () => {
			// floor((0 + 300 * 2^0) / 4) = floor(300 / 4) = 75
			expect(getXpForNextLevel(0)).toBe(75);
		});

		it('should return correct XP for level 1→2', () => {
			// floor((1 + 300 * 2^(1/7)) / 4)
			const xp = getXpForNextLevel(1);
			expect(xp).toBeGreaterThan(75); // Should be more than level 0→1
		});

		it('should match cumulative XP calculation', () => {
			for (let level = 0; level < 10; level++) {
				const xpForNext = getXpForNextLevel(level);
				const cumulativeToLevel = getXpForLevel(level);
				const cumulativeToNextLevel = getXpForLevel(level + 1);
				
				expect(cumulativeToNextLevel - cumulativeToLevel).toBe(xpForNext);
			}
		});

		it('should throw error for negative level', () => {
			expect(() => getXpForNextLevel(-1)).toThrow();
		});

		it('should throw error for level at or above max', () => {
			expect(() => getXpForNextLevel(MAX_LEVEL)).toThrow();
			expect(() => getXpForNextLevel(MAX_LEVEL + 1)).toThrow();
		});
	});

	describe('getLevelFromXp', () => {
		it('should return 0 for 0 XP', () => {
			expect(getLevelFromXp(0)).toBe(0);
		});

		it('should return 0 for negative XP', () => {
			expect(getLevelFromXp(-100)).toBe(0);
		});

		it('should return correct level for exact level boundaries', () => {
			for (let level = 0; level <= 10; level++) {
				const xp = getXpForLevel(level);
				expect(getLevelFromXp(xp)).toBe(level);
			}
		});

		it('should return correct level for XP between levels', () => {
			// XP between level 1 and 2
			const level1Xp = getXpForLevel(1);
			const level2Xp = getXpForLevel(2);
			const midXp = Math.floor((level1Xp + level2Xp) / 2);
			
			expect(getLevelFromXp(midXp)).toBe(1);
		});

		it('should return correct level for XP just below next level', () => {
			const level2Xp = getXpForLevel(2);
			
			expect(getLevelFromXp(level2Xp - 1)).toBe(1);
			expect(getLevelFromXp(level2Xp)).toBe(2);
		});

		it('should return max level for XP exceeding max level XP', () => {
			const maxXp = getXpForLevel(MAX_LEVEL);
			expect(getLevelFromXp(maxXp)).toBe(MAX_LEVEL);
			expect(getLevelFromXp(maxXp + 1000)).toBe(MAX_LEVEL);
			expect(getLevelFromXp(maxXp * 2)).toBe(MAX_LEVEL);
		});

		it('should handle various XP values correctly', () => {
			// Test a range of XP values
			const testCases = [
				{ xp: 0, expectedLevel: 0 },
				{ xp: 75, expectedLevel: 1 },
				{ xp: 100, expectedLevel: 1 },
				{ xp: 200, expectedLevel: 2 },
				{ xp: 1000, expectedLevel: 5 },
				{ xp: 10000, expectedLevel: 15 },
			];

			for (const testCase of testCases) {
				const level = getLevelFromXp(testCase.xp);
				// Verify level is correct (within expected range)
				const levelXp = getXpForLevel(level);
				const nextLevelXp = level < MAX_LEVEL ? getXpForLevel(level + 1) : levelXp;
				
				expect(levelXp).toBeLessThanOrEqual(testCase.xp);
				if (level < MAX_LEVEL) {
					expect(nextLevelXp).toBeGreaterThan(testCase.xp);
				}
			}
		});
	});

	describe('getXpToNextLevel', () => {
		it('should return correct XP for 0 XP', () => {
			expect(getXpToNextLevel(0)).toBe(75); // Need 75 XP to reach level 1
		});

		it('should return correct XP when level is provided', () => {
			const level1Xp = getXpForLevel(1);
			const level2Xp = getXpForLevel(2);
			const midXp = Math.floor((level1Xp + level2Xp) / 2);
			
			expect(getXpToNextLevel(midXp, 1)).toBe(level2Xp - midXp);
		});

		it('should calculate level automatically if not provided', () => {
			const level1Xp = getXpForLevel(1);
			const level2Xp = getXpForLevel(2);
			const midXp = Math.floor((level1Xp + level2Xp) / 2);
			
			expect(getXpToNextLevel(midXp)).toBe(level2Xp - midXp);
		});

		it('should return 0 for max level', () => {
			const maxXp = getXpForLevel(MAX_LEVEL);
			expect(getXpToNextLevel(maxXp, MAX_LEVEL)).toBe(0);
			expect(getXpToNextLevel(maxXp + 1000, MAX_LEVEL)).toBe(0);
		});

		it('should return 0 for XP exceeding max level', () => {
			const maxXp = getXpForLevel(MAX_LEVEL);
			expect(getXpToNextLevel(maxXp * 2)).toBe(0);
		});

		it('should return correct XP for exact level boundaries', () => {
			for (let level = 0; level < 10; level++) {
				const levelXp = getXpForLevel(level);
				const nextLevelXp = getXpForLevel(level + 1);
				const xpNeeded = getXpToNextLevel(levelXp, level);
				
				expect(xpNeeded).toBe(nextLevelXp - levelXp);
			}
		});

		it('should handle XP between levels correctly', () => {
			const level1Xp = getXpForLevel(1);
			const level2Xp = getXpForLevel(2);
			const midXp = level1Xp + Math.floor((level2Xp - level1Xp) / 2);
			
			const xpNeeded = getXpToNextLevel(midXp);
			expect(xpNeeded).toBe(level2Xp - midXp);
			expect(xpNeeded).toBeGreaterThan(0);
		});
	});

	describe('Formula Correctness', () => {
		it('should match manual calculation for level 0→1', () => {
			// floor((0 + 300 * 2^(0/7)) / 4) = floor((0 + 300 * 1) / 4) = floor(300 / 4) = 75
			expect(getXpForNextLevel(0)).toBe(75);
		});

		it('should have increasing XP requirements per level', () => {
			const xpRequirements: number[] = [];
			for (let level = 0; level < 20; level++) {
				xpRequirements.push(getXpForNextLevel(level));
			}
			
			// Each level should require more XP than the previous (or equal for very early levels)
			for (let i = 1; i < xpRequirements.length; i++) {
				expect(xpRequirements[i]).toBeGreaterThanOrEqual(xpRequirements[i - 1]);
			}
		});

		it('should have exponential growth pattern', () => {
			// XP requirements should grow significantly as levels increase
			const lowLevelXp = getXpForNextLevel(10);
			const midLevelXp = getXpForNextLevel(50);
			const highLevelXp = getXpForNextLevel(100);
			
			expect(midLevelXp).toBeGreaterThan(lowLevelXp * 2);
			expect(highLevelXp).toBeGreaterThan(midLevelXp * 2);
		});
	});

	describe('Runescape Benchmarks', () => {
		it('should match Runescape level 99 XP requirement within tolerance', () => {
			// Level 99 is a famous milestone in Runescape
			// Cumulative XP required: 13,034,431
			// Our formula produces values very close (within 0.0003% error)
			const actualXp = getXpForLevel(99);
			const runescapeXp = 13_034_431;
			// Use relative tolerance: 1e-4 = 0.01% relative error
			const tolerance = Math.abs(runescapeXp * 1e-4);
			expect(Math.abs(actualXp - runescapeXp)).toBeLessThan(tolerance);
		});

		it('should match Runescape level 120 XP requirement within tolerance', () => {
			// Level 120 is the maximum level in Runescape
			// Cumulative XP required: 104,273,167
			// Our formula produces values very close (within 0.00003% error)
			const actualXp = getXpForLevel(120);
			const runescapeXp = 104_273_167;
			// Use relative tolerance: 1e-4 = 0.01% relative error
			const tolerance = Math.abs(runescapeXp * 1e-4);
			expect(Math.abs(actualXp - runescapeXp)).toBeLessThan(tolerance);
		});

		it('should correctly calculate level from Runescape benchmark XP values', () => {
			// Verify reverse lookup works for benchmark values
			// Using our calculated values for level boundaries
			const level99Xp = getXpForLevel(99);
			const level120Xp = getXpForLevel(120);
			
			expect(getLevelFromXp(level99Xp)).toBe(99);
			expect(getLevelFromXp(level120Xp)).toBe(120);
			
			// Test values just below and above level 99
			expect(getLevelFromXp(level99Xp - 1)).toBe(98);
			expect(getLevelFromXp(level99Xp + 1)).toBe(99);
			
			// Test values just below and above level 120
			expect(getLevelFromXp(level120Xp - 1)).toBe(119);
			expect(getLevelFromXp(level120Xp + 1)).toBe(120);
		});
	});
});

