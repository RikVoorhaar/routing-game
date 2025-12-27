import { describe, it, expect } from 'vitest';
import {
	checkLevelRequirements,
	checkUpgradeRequirements,
	applyUpgradeEffect
} from './upgradeUtils';
import type { GameState } from '../db/schema';
import { JobCategory } from '$lib/jobs/jobCategories';
import { getXpForLevel } from '$lib/xp/xpUtils';
import type { UpgradeEffectType } from '$lib/config/types';

describe('Upgrade Utilities', () => {
	describe('checkLevelRequirements', () => {
		it('should return true when no requirements specified', () => {
			const gameState: GameState = {
				id: 'test',
				name: 'Test',
				userId: 'user1',
				createdAt: new Date(),
				money: 100,
				xp: {},
				upgradesPurchased: [],
				upgradeEffects: {}
			};

			expect(checkLevelRequirements(gameState, {})).toBe(true);
		});

		it('should check total level requirement', () => {
			// Level 5 requires 83 + 87 + 92 + 97 + 102 = 461 XP (approximately)
			const level5Xp = getXpForLevel(5);
			const gameState: GameState = {
				id: 'test',
				name: 'Test',
				userId: 'user1',
				createdAt: new Date(),
				money: 100,
				xp: {
					[JobCategory.GROCERIES]: level5Xp,
					[JobCategory.PACKAGES]: 0
				},
				upgradesPurchased: [],
				upgradeEffects: {}
			};

			expect(checkLevelRequirements(gameState, { total: 5 })).toBe(true);
			expect(checkLevelRequirements(gameState, { total: 6 })).toBe(false);
		});

		it('should check category-specific level requirements', () => {
			const level3Xp = getXpForLevel(3);
			const gameState: GameState = {
				id: 'test',
				name: 'Test',
				userId: 'user1',
				createdAt: new Date(),
				money: 100,
				xp: {
					[JobCategory.GROCERIES]: level3Xp,
					[JobCategory.PACKAGES]: 0
				},
				upgradesPurchased: [],
				upgradeEffects: {}
			};

			// Category keys use enum names (e.g., "GROCERIES")
			expect(checkLevelRequirements(gameState, { GROCERIES: 3 })).toBe(true);
			expect(checkLevelRequirements(gameState, { GROCERIES: 4 })).toBe(false);
		});

		it('should check both total and category requirements', () => {
			// Use smaller XP values to ensure total doesn't exceed level 6
			const level3Xp = getXpForLevel(3);
			const level2Xp = getXpForLevel(2);
			const totalXp = level3Xp + level2Xp;
			const level6Xp = getXpForLevel(6);

			// Verify total XP is less than level 6 requirement
			// (This should be true since we're using relatively low levels)
			if (totalXp >= level6Xp) {
				// If this fails, use even smaller values
				const level2XpSmall = getXpForLevel(2);
				const level1XpSmall = getXpForLevel(1);
				const gameState: GameState = {
					id: 'test',
					name: 'Test',
					userId: 'user1',
					createdAt: new Date(),
					money: 100,
					xp: {
						[JobCategory.GROCERIES]: level2XpSmall,
						[JobCategory.PACKAGES]: level1XpSmall
					},
					upgradesPurchased: [],
					upgradeEffects: {}
				};
				// Category keys use enum names (e.g., "PACKAGES")
				expect(checkLevelRequirements(gameState, { total: 2, PACKAGES: 1 })).toBe(true);
				expect(checkLevelRequirements(gameState, { total: 3, PACKAGES: 1 })).toBe(false);
				return;
			}

			const gameState: GameState = {
				id: 'test',
				name: 'Test',
				userId: 'user1',
				createdAt: new Date(),
				money: 100,
				xp: {
					[JobCategory.GROCERIES]: level3Xp,
					[JobCategory.PACKAGES]: level2Xp
				},
				upgradesPurchased: [],
				upgradeEffects: {}
			};

			// Category keys use enum names (e.g., "PACKAGES")
			expect(checkLevelRequirements(gameState, { total: 3, PACKAGES: 2 })).toBe(true);
			expect(checkLevelRequirements(gameState, { total: 6, PACKAGES: 2 })).toBe(false);
			expect(checkLevelRequirements(gameState, { total: 3, PACKAGES: 3 })).toBe(false);
		});

		it('should handle missing XP categories as level 0', () => {
			const gameState: GameState = {
				id: 'test',
				name: 'Test',
				userId: 'user1',
				createdAt: new Date(),
				money: 100,
				xp: {},
				upgradesPurchased: [],
				upgradeEffects: {}
			};

			expect(checkLevelRequirements(gameState, { GROCERIES: 0 })).toBe(true);
			expect(checkLevelRequirements(gameState, { GROCERIES: 1 })).toBe(false);
		});

		it('should handle undefined requirements', () => {
			const gameState: GameState = {
				id: 'test',
				name: 'Test',
				userId: 'user1',
				createdAt: new Date(),
				money: 100,
				xp: {},
				upgradesPurchased: [],
				upgradeEffects: {}
			};

			expect(checkLevelRequirements(gameState, { total: undefined, GROCERIES: undefined })).toBe(
				true
			);
		});
	});

	describe('checkUpgradeRequirements', () => {
		it('should return true when no requirements', () => {
			expect(checkUpgradeRequirements([], [])).toBe(true);
			expect(checkUpgradeRequirements(['upgrade1'], [])).toBe(true);
		});

		it('should return true when all requirements met', () => {
			const purchased = ['upgrade1', 'upgrade2', 'upgrade3'];
			const required = ['upgrade1', 'upgrade2'];

			expect(checkUpgradeRequirements(purchased, required)).toBe(true);
		});

		it('should return false when requirements not met', () => {
			const purchased = ['upgrade1'];
			const required = ['upgrade1', 'upgrade2'];

			expect(checkUpgradeRequirements(purchased, required)).toBe(false);
		});

		it('should handle multiple requirements', () => {
			const purchased = ['upgrade1', 'upgrade2', 'upgrade3'];
			const required = ['upgrade1', 'upgrade2', 'upgrade3'];

			expect(checkUpgradeRequirements(purchased, required)).toBe(true);
		});

		it('should handle empty purchased array', () => {
			expect(checkUpgradeRequirements([], ['upgrade1'])).toBe(false);
		});
	});

	describe('applyUpgradeEffect', () => {
		it('should apply multiply effect to existing value', () => {
			const currentEffects = { speed: 5 };
			const result = applyUpgradeEffect(currentEffects, 'multiply', {
				name: 'speed',
				amount: 1.2
			});

			expect(result.speed).toBe(6); // 5 * 1.2 = 6
		});

		it('should apply multiply effect with default value of 1', () => {
			const currentEffects = {};
			const result = applyUpgradeEffect(currentEffects, 'multiply', {
				name: 'speed',
				amount: 1.5
			});

			expect(result.speed).toBe(1.5); // 1 * 1.5 = 1.5
		});

		it('should apply increment effect to existing value', () => {
			const currentEffects = { vehicleLevelMax: 2 };
			const result = applyUpgradeEffect(currentEffects, 'increment', {
				name: 'vehicleLevelMax',
				amount: 1
			});

			expect(result.vehicleLevelMax).toBe(3); // 2 + 1 = 3
		});

		it('should apply increment effect with default value of 0', () => {
			const currentEffects = {};
			const result = applyUpgradeEffect(currentEffects, 'increment', {
				name: 'vehicleLevelMax',
				amount: 1
			});

			expect(result.vehicleLevelMax).toBe(1); // 0 + 1 = 1
		});

		it('should preserve other effects when updating one', () => {
			const currentEffects = {
				speed: 5,
				xpMultiplier: 1.5,
				vehicleLevelMax: 2
			};
			const result = applyUpgradeEffect(currentEffects, 'multiply', {
				name: 'speed',
				amount: 1.2
			});

			expect(result.speed).toBe(6);
			expect(result.xpMultiplier).toBe(1.5);
			expect(result.vehicleLevelMax).toBe(2);
		});

		it('should handle multiple effect types', () => {
			let effects = {};
			effects = applyUpgradeEffect(effects, 'multiply', { name: 'speed', amount: 1.2 });
			effects = applyUpgradeEffect(effects, 'increment', { name: 'vehicleLevelMax', amount: 1 });
			effects = applyUpgradeEffect(effects, 'multiply', { name: 'xpMultiplier', amount: 1.5 });

			expect(effects.speed).toBe(1.2);
			expect(effects.vehicleLevelMax).toBe(1);
			expect(effects.xpMultiplier).toBe(1.5);
		});

		it('should create new object and not mutate original', () => {
			const currentEffects = { speed: 5 };
			const result = applyUpgradeEffect(currentEffects, 'multiply', {
				name: 'speed',
				amount: 1.2
			});

			expect(result).not.toBe(currentEffects);
			expect(currentEffects.speed).toBe(5); // Original unchanged
			expect(result.speed).toBe(6);
		});

		it('should throw error for unknown effect type', () => {
			const currentEffects = {};
			expect(() => {
				applyUpgradeEffect(currentEffects, 'unknown' as UpgradeEffectType, {
					name: 'speed',
					amount: 1.2
				});
			}).toThrow('Unknown effect type: unknown');
		});

		it('should handle negative amounts for increment', () => {
			const currentEffects = { vehicleLevelMax: 5 };
			const result = applyUpgradeEffect(currentEffects, 'increment', {
				name: 'vehicleLevelMax',
				amount: -2
			});

			expect(result.vehicleLevelMax).toBe(3); // 5 + (-2) = 3
		});

		it('should handle fractional amounts for multiply', () => {
			const currentEffects = { speed: 10 };
			const result = applyUpgradeEffect(currentEffects, 'multiply', {
				name: 'speed',
				amount: 0.5
			});

			expect(result.speed).toBe(5); // 10 * 0.5 = 5
		});
	});
});
