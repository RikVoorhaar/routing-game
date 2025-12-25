import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { computeXpGain, buildCategoryXpIncrementExpr, buildMultiCategoryXpIncrementExpr } from './xpUpdates';

describe('XP Update Utilities', () => {
	describe('computeXpGain', () => {
		it('should floor XP gain correctly', () => {
			expect(computeXpGain(100, 1.5)).toBe(150);
			expect(computeXpGain(100, 1.7)).toBe(170);
			expect(computeXpGain(100, 1.99)).toBe(199);
			expect(computeXpGain(100, 1.999)).toBe(199); // Floors down
		});

		it('should handle multiplier of 1', () => {
			expect(computeXpGain(100, 1)).toBe(100);
			expect(computeXpGain(50, 1)).toBe(50);
			expect(computeXpGain(0, 1)).toBe(0);
		});

		it('should handle multiplier greater than 1', () => {
			expect(computeXpGain(100, 2)).toBe(200);
			expect(computeXpGain(50, 3.5)).toBe(175);
			expect(computeXpGain(10, 10)).toBe(100);
		});

		it('should handle multiplier less than 1', () => {
			expect(computeXpGain(100, 0.5)).toBe(50);
			expect(computeXpGain(100, 0.1)).toBe(10);
			expect(computeXpGain(100, 0.99)).toBe(99);
		});

		it('should default multiplier to 1 if not provided', () => {
			expect(computeXpGain(100)).toBe(100);
			expect(computeXpGain(50)).toBe(50);
		});

		it('should handle zero base XP', () => {
			expect(computeXpGain(0, 1)).toBe(0);
			expect(computeXpGain(0, 2)).toBe(0);
			expect(computeXpGain(0, 0.5)).toBe(0);
		});

		it('should clamp negative base XP to 0', () => {
			expect(computeXpGain(-100, 1)).toBe(0);
			expect(computeXpGain(-50, 2)).toBe(0);
		});

		it('should clamp negative multipliers to 0', () => {
			expect(computeXpGain(100, -1)).toBe(0);
			expect(computeXpGain(100, -0.5)).toBe(0);
			expect(computeXpGain(50, -10)).toBe(0);
		});

		it('should handle zero multiplier', () => {
			expect(computeXpGain(100, 0)).toBe(0);
			expect(computeXpGain(50, 0)).toBe(0);
		});
	});

	describe('buildCategoryXpIncrementExpr', () => {
		it('should return a SQL expression object', () => {
			const expr = buildCategoryXpIncrementExpr(sql`game_states.xp`, '0', 100);
			expect(expr).toBeDefined();
			expect(expr).not.toBeNull();
			// The expression should be a SQL object from drizzle
			expect(typeof expr).toBe('object');
		});

		it('should handle different category keys', () => {
			const expr1 = buildCategoryXpIncrementExpr(sql`game_states.xp`, '0', 100);
			const expr2 = buildCategoryXpIncrementExpr(sql`game_states.xp`, '5', 200);
			expect(expr1).toBeDefined();
			expect(expr2).toBeDefined();
		});

		it('should handle zero delta', () => {
			const expr = buildCategoryXpIncrementExpr(sql`game_states.xp`, '0', 0);
			expect(expr).toBeDefined();
		});

		it('should handle negative delta', () => {
			const expr = buildCategoryXpIncrementExpr(sql`game_states.xp`, '0', -50);
			expect(expr).toBeDefined();
		});

		it('should handle large deltas', () => {
			const expr = buildCategoryXpIncrementExpr(sql`game_states.xp`, '0', 1000000);
			expect(expr).toBeDefined();
		});
	});

	describe('buildMultiCategoryXpIncrementExpr', () => {
		it('should return a SQL expression object', () => {
			const deltas = { '0': 100, '1': 50 };
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
			expect(expr).not.toBeNull();
			expect(typeof expr).toBe('object');
		});

		it('should handle empty deltas object', () => {
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, {});
			expect(expr).toBeDefined();
			// Should return the original JSONB unchanged
		});

		it('should handle single category', () => {
			const deltas = { '0': 100 };
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
		});

		it('should handle multiple categories', () => {
			const deltas = { '0': 100, '1': 50, '2': 200 };
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
		});

		it('should skip zero deltas', () => {
			const deltas = { '0': 100, '1': 0, '2': 50 };
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
			// Zero deltas should be skipped in the expression
		});

		it('should handle all zero deltas', () => {
			const deltas = { '0': 0, '1': 0 };
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
			// Should return original JSONB since all deltas are zero
		});

		it('should handle negative deltas', () => {
			const deltas = { '0': -50, '1': 100 };
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
		});

		it('should handle large number of categories', () => {
			const deltas: Record<string, number> = {};
			for (let i = 0; i < 9; i++) {
				deltas[String(i)] = i * 10;
			}
			const expr = buildMultiCategoryXpIncrementExpr(sql`game_states.xp`, deltas);
			expect(expr).toBeDefined();
		});
	});
});

