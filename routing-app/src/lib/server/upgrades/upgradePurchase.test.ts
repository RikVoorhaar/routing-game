import { describe, it, expect } from 'vitest';
import { UPGRADE_DEFINITIONS } from '$lib/upgrades/upgradeDefinitions';

describe('Upgrade Purchase Logic', () => {
	describe('Upgrade Definitions', () => {
		it('should have upgrade definitions', () => {
			expect(UPGRADE_DEFINITIONS.length).toBeGreaterThan(0);
		});

		it('should have unique upgrade IDs', () => {
			const ids = UPGRADE_DEFINITIONS.map((u) => u.id);
			const uniqueIds = new Set(ids);
			expect(ids.length).toBe(uniqueIds.size);
		});

		it('should have valid upgrade structure', () => {
			for (const upgrade of UPGRADE_DEFINITIONS) {
				expect(upgrade).toHaveProperty('id');
				expect(upgrade).toHaveProperty('name');
				expect(upgrade).toHaveProperty('cost');
				expect(upgrade).toHaveProperty('effect');
				expect(upgrade).toHaveProperty('effectArguments');
				expect(upgrade).toHaveProperty('levelRequirements');
				expect(upgrade).toHaveProperty('upgradeRequirements');

				expect(typeof upgrade.id).toBe('string');
				expect(typeof upgrade.name).toBe('string');
				expect(typeof upgrade.cost).toBe('number');
				expect(['multiply', 'increment']).toContain(upgrade.effect);
				expect(upgrade.effectArguments).toHaveProperty('name');
				expect(upgrade.effectArguments).toHaveProperty('amount');
				expect(Array.isArray(upgrade.upgradeRequirements)).toBe(true);
			}
		});

		it('should have valid upgrade requirements references', () => {
			const upgradeIds = new Set(UPGRADE_DEFINITIONS.map((u) => u.id));

			for (const upgrade of UPGRADE_DEFINITIONS) {
				for (const requiredId of upgrade.upgradeRequirements) {
					expect(upgradeIds.has(requiredId)).toBe(true);
				}
			}
		});

		it('should have non-negative costs', () => {
			for (const upgrade of UPGRADE_DEFINITIONS) {
				expect(upgrade.cost).toBeGreaterThanOrEqual(0);
			}
		});

		it('should have valid effect arguments', () => {
			const validEffectNames = [
				'speed',
				'vehicleLevelMax',
				'vehicleLevelMin',
				'employeeLevelStart',
				'xpMultiplier',
				'moneyTimeFactor',
				'moneyDistanceFactor',
				'capacity',
				'upgradeDiscount'
			];

			for (const upgrade of UPGRADE_DEFINITIONS) {
				expect(validEffectNames).toContain(upgrade.effectArguments.name);
				expect(typeof upgrade.effectArguments.amount).toBe('number');
			}
		});
	});

	describe('Purchase Validation Logic', () => {
		// Note: Full integration tests would require a test database setup
		// These tests verify the upgrade definitions are valid for purchase logic

		it('should have upgrades with valid level requirements', () => {
			for (const upgrade of UPGRADE_DEFINITIONS) {
				// Level requirements should be objects
				expect(typeof upgrade.levelRequirements).toBe('object');
				expect(upgrade.levelRequirements).not.toBeNull();

				// If total is specified, it should be a number
				if (upgrade.levelRequirements.total !== undefined) {
					expect(typeof upgrade.levelRequirements.total).toBe('number');
					expect(upgrade.levelRequirements.total).toBeGreaterThanOrEqual(0);
				}
			}
		});

		it('should have upgrades with valid dependency chains', () => {
			// Check that upgrade dependencies don't create circular references
			const upgradeMap = new Map(UPGRADE_DEFINITIONS.map((u) => [u.id, u]));

			function checkDependencies(upgradeId: string, visited: Set<string>): boolean {
				if (visited.has(upgradeId)) {
					return false; // Circular dependency detected
				}

				visited.add(upgradeId);
				const upgrade = upgradeMap.get(upgradeId);
				if (!upgrade) {
					return true; // Upgrade not found, but that's a different issue
				}

				for (const depId of upgrade.upgradeRequirements) {
					if (!checkDependencies(depId, new Set(visited))) {
						return false;
					}
				}

				return true;
			}

			for (const upgrade of UPGRADE_DEFINITIONS) {
				const visited = new Set<string>();
				expect(checkDependencies(upgrade.id, visited)).toBe(true);
			}
		});

		it('should have vehicle unlock upgrades that increment vehicleLevelMax', () => {
			const vehicleUnlockUpgrades = UPGRADE_DEFINITIONS.filter(
				(u) => u.id.startsWith('unlock_') && u.effectArguments.name === 'vehicleLevelMax'
			);

			expect(vehicleUnlockUpgrades.length).toBeGreaterThan(0);

			for (const upgrade of vehicleUnlockUpgrades) {
				expect(upgrade.effect).toBe('increment');
				expect(upgrade.effectArguments.amount).toBe(1);
			}
		});
	});
});
