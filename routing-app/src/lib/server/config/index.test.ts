import { describe, it, expect } from 'vitest';
import type { UpgradeConfig, VehicleConfig } from '$lib/config/types';
import {
	validateUpgradesConfig,
	validateVehiclesConfig,
	validateVehicleUpgradeRelationship
} from './index';

describe('Config Loading and Validation', () => {
	describe('validateUpgradesConfig', () => {
		it('should validate a valid upgrades config', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'unlock_cargo_bike',
					name: 'Cargo Bike',
					upgradeRequirements: [], // No dependency - bike is pre-unlocked
					levelRequirements: { total: 1 },
					description: 'Unlocks cargo bike',
					cost: 20,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				},
				{
					id: 'unlock_electric_bike',
					name: 'Electric Bike',
					upgradeRequirements: ['unlock_cargo_bike'],
					levelRequirements: { total: 3 },
					description: 'Unlocks electric bike',
					cost: 50,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 2 }
				},
				{
					id: 'careful_driver',
					name: 'Careful Driver',
					upgradeRequirements: [],
					levelRequirements: { total: 5 },
					description: 'Increase speed of all jobs by 20%',
					cost: 20,
					effect: 'multiply',
					effectArguments: { name: 'speed', amount: 1.2 }
				}
			];
			expect(() => validateUpgradesConfig(upgrades)).not.toThrow();
			expect(upgrades).toHaveLength(3); // 2 vehicle unlocks (bike is pre-unlocked) + 1 other upgrade
			expect(upgrades[0].id).toBe('unlock_cargo_bike');
		});

		it('should reject config with missing upgrades array', () => {
			expect(() => validateUpgradesConfig(null as unknown as UpgradeConfig[])).toThrow(
				/upgrades must be an array/
			);
		});

		it('should reject config with upgrade missing required fields', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'test_upgrade',
					// Missing name field
					upgradeRequirements: [],
					levelRequirements: { total: 1 },
					description: 'Test upgrade',
					cost: 10,
					effect: 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				} as unknown as UpgradeConfig
			];
			expect(() => validateUpgradesConfig(upgrades)).toThrow(/name must be a non-empty string/);
		});

		it('should reject config with upgrade having wrong field types', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'test_upgrade',
					name: 'Test Upgrade',
					upgradeRequirements: [],
					levelRequirements: { total: 1 },
					description: 'Test upgrade',
					cost: 'not a number' as unknown as number, // Wrong type
					effect: 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				}
			];
			expect(() => validateUpgradesConfig(upgrades)).toThrow(/cost must be a non-negative number/);
		});

		it('should reject config with duplicate upgrade IDs', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'duplicate_id',
					name: 'First',
					upgradeRequirements: [],
					levelRequirements: {},
					description: 'First upgrade',
					cost: 10,
					effect: 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				},
				{
					id: 'duplicate_id',
					name: 'Second',
					upgradeRequirements: [],
					levelRequirements: {},
					description: 'Second upgrade',
					cost: 20,
					effect: 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				}
			];
			expect(() => validateUpgradesConfig(upgrades)).toThrow(/Duplicate upgrade ID/);
		});

		it('should reject config with invalid effect type', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'test',
					name: 'Test',
					upgradeRequirements: [],
					levelRequirements: {},
					description: 'Test',
					cost: 10,
					effect: 'invalid' as 'multiply' | 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				}
			];
			expect(() => validateUpgradesConfig(upgrades)).toThrow(
				/effect must be either 'multiply', 'increment', or 'set'/
			);
		});

		it('should reject config with invalid effectArguments', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'test',
					name: 'Test',
					upgradeRequirements: [],
					levelRequirements: {},
					description: 'Test',
					cost: 10,
					effect: 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 'not a number' } as unknown as {
						name: string;
						amount: number;
					}
				}
			];
			expect(() => validateUpgradesConfig(upgrades)).toThrow(/effectArguments must be an object/);
		});

		it('should reject config with negative cost', () => {
			const upgrades: UpgradeConfig[] = [
				{
					id: 'test',
					name: 'Test',
					upgradeRequirements: [],
					levelRequirements: {},
					description: 'Test',
					cost: -10,
					effect: 'increment',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				}
			];
			expect(() => validateUpgradesConfig(upgrades)).toThrow(/cost must be a non-negative number/);
		});
	});

	describe('validateVehiclesConfig', () => {
		it('should validate a valid vehicles config', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				},
				{
					id: 'electric_bike',
					level: 2,
					name: 'Electric Bike',
					capacity: 40,
					roadSpeed: 25,
					tier: 2,
					purchaseCost: 25,
					unlockCost: 50,
					unlockLevelRequirement: 3,
					purchaseLevelRequirement: 2
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).not.toThrow();
			expect(vehicles).toHaveLength(3);
			expect(vehicles[0].level).toBe(0);
			expect(vehicles[0].name).toBe('Bike');
		});

		it('should reject config with missing vehicles array', () => {
			expect(() => validateVehiclesConfig(null as unknown as VehicleConfig[])).toThrow(
				/vehicles must be an array/
			);
		});

		it('should reject config with duplicate vehicle levels', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				},
				{
					id: 'another_bike',
					level: 1, // Duplicate level
					name: 'Another Bike',
					capacity: 30,
					roadSpeed: 18,
					tier: 1,
					purchaseCost: 15,
					unlockCost: 25,
					unlockLevelRequirement: 2,
					purchaseLevelRequirement: 1
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).toThrow(/Duplicate vehicle level: 1/);
		});

		it('should reject config missing level 0 vehicle', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'cargo_bike',
					level: 1, // Missing level 0
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				},
				{
					id: 'electric_bike',
					level: 2,
					name: 'Electric Bike',
					capacity: 40,
					roadSpeed: 25,
					tier: 2,
					purchaseCost: 25,
					unlockCost: 50,
					unlockLevelRequirement: 3,
					purchaseLevelRequirement: 2
				}
			];
			// This should pass vehicle validation, but fail relationship validation
			expect(() => validateVehiclesConfig(vehicles)).not.toThrow();
		});

		it('should reject config with negative vehicle level', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'invalid',
					level: -1,
					name: 'Invalid',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).toThrow(/level must be a non-negative number/);
		});

		it('should reject config with invalid capacity', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'test',
					level: 0,
					name: 'Test',
					capacity: 0, // Invalid: must be positive
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).toThrow(/capacity must be a positive number/);
		});

		it('should reject config with invalid roadSpeed', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'test',
					level: 0,
					name: 'Test',
					capacity: 10,
					roadSpeed: -5, // Invalid: must be positive
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).toThrow(/roadSpeed must be a positive number/);
		});

		it('should reject config with invalid tier', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'test',
					level: 0,
					name: 'Test',
					capacity: 10,
					roadSpeed: 15,
					tier: 0, // Invalid: must be >= 1
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).toThrow(/tier must be >= 1/);
		});

		it('should reject config with missing vehicle name', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'test',
					level: 0,
					name: '', // Invalid: must be non-empty
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				}
			];
			expect(() => validateVehiclesConfig(vehicles)).toThrow(/name must be a non-empty string/);
		});
	});

	describe('validateVehicleUpgradeRelationship', () => {
		it('should validate a valid vehicle-upgrade relationship', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				},
				{
					id: 'electric_bike',
					level: 2,
					name: 'Electric Bike',
					capacity: 40,
					roadSpeed: 25,
					tier: 2,
					purchaseCost: 25,
					unlockCost: 50,
					unlockLevelRequirement: 3,
					purchaseLevelRequirement: 2
				}
			];
			const upgrades: UpgradeConfig[] = [
				// Bike (level 0) is pre-unlocked, so no upgrade needed
				{
					id: 'unlock_cargo_bike',
					name: 'Cargo Bike',
					upgradeRequirements: [], // No dependency - bike is pre-unlocked
					levelRequirements: { total: 1 },
					description: 'Unlocks cargo bike',
					cost: 20,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				},
				{
					id: 'unlock_electric_bike',
					name: 'Electric Bike',
					upgradeRequirements: ['unlock_cargo_bike'],
					levelRequirements: { total: 3 },
					description: 'Unlocks electric bike',
					cost: 50,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 2 }
				}
			];
			expect(() => validateVehicleUpgradeRelationship(vehicles, upgrades)).not.toThrow();
		});

		it('should reject when there are insufficient vehicle unlock upgrades', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				},
				{
					id: 'electric_bike',
					level: 2,
					name: 'Electric Bike',
					capacity: 40,
					roadSpeed: 25,
					tier: 2,
					purchaseCost: 25,
					unlockCost: 50,
					unlockLevelRequirement: 3,
					purchaseLevelRequirement: 2
				}
			];
			const upgrades: UpgradeConfig[] = [
				// Only 1 vehicle unlock upgrade, but vehicles have levels 0-2
				// Level 0 is pre-unlocked, so we need upgrades for levels 1-2 (2 upgrades)
				{
					id: 'unlock_cargo_bike',
					name: 'Cargo Bike',
					upgradeRequirements: [],
					levelRequirements: { total: 1 },
					description: 'Unlocks cargo bike upgrade for all employees',
					cost: 20,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				}
			];
			expect(() => validateVehicleUpgradeRelationship(vehicles, upgrades)).toThrow(
				/Need at least 2 vehicle unlock upgrades/
			);
		});

		it('should reject when level 0 vehicle is missing', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'cargo_bike',
					level: 1, // Missing level 0
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				},
				{
					id: 'electric_bike',
					level: 2,
					name: 'Electric Bike',
					capacity: 40,
					roadSpeed: 25,
					tier: 2,
					purchaseCost: 25,
					unlockCost: 50,
					unlockLevelRequirement: 3,
					purchaseLevelRequirement: 2
				}
			];
			const upgrades: UpgradeConfig[] = [
				// Bike upgrade doesn't exist (it's pre-unlocked), but we still need level 0 vehicle
				{
					id: 'unlock_cargo_bike',
					name: 'Cargo Bike',
					upgradeRequirements: [],
					levelRequirements: { total: 1 },
					description: 'Unlocks cargo bike',
					cost: 20,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				},
				{
					id: 'unlock_electric_bike',
					name: 'Electric Bike',
					upgradeRequirements: ['unlock_cargo_bike'],
					levelRequirements: { total: 3 },
					description: 'Unlocks electric bike',
					cost: 50,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 2 }
				}
			];
			expect(() => validateVehicleUpgradeRelationship(vehicles, upgrades)).toThrow(
				/Vehicle level 0 must exist/
			);
		});

		it('should accept config with exact number of unlock upgrades needed', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				}
			];
			const upgrades: UpgradeConfig[] = [
				// Bike (level 0) is pre-unlocked, so only need upgrade for level 1
				{
					id: 'unlock_cargo_bike',
					name: 'Cargo Bike',
					upgradeRequirements: [], // No dependency - bike is pre-unlocked
					levelRequirements: { total: 1 },
					description: 'Unlocks cargo bike',
					cost: 20,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				}
			];
			expect(() => validateVehicleUpgradeRelationship(vehicles, upgrades)).not.toThrow();
		});

		it('should accept config with more unlock upgrades than needed', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				}
			];
			const upgrades: UpgradeConfig[] = [
				// Bike (level 0) is pre-unlocked, so only need upgrade for level 1
				// But we can have extra upgrades (like level 2) and it's fine
				{
					id: 'unlock_cargo_bike',
					name: 'Cargo Bike',
					upgradeRequirements: [], // No dependency - bike is pre-unlocked
					levelRequirements: { total: 1 },
					description: 'Unlocks cargo bike',
					cost: 20,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				},
				{
					id: 'unlock_electric_bike',
					name: 'Electric Bike',
					upgradeRequirements: ['unlock_cargo_bike'],
					levelRequirements: { total: 3 },
					description: 'Unlocks electric bike',
					cost: 25,
					effect: 'set',
					effectArguments: { name: 'vehicleLevelMax', amount: 2 }
				}
			];
			expect(() => validateVehicleUpgradeRelationship(vehicles, upgrades)).not.toThrow();
		});

		it('should only count upgrades that set vehicleLevelMax', () => {
			const vehicles: VehicleConfig[] = [
				{
					id: 'bike',
					level: 0,
					name: 'Bike',
					capacity: 10,
					roadSpeed: 15,
					tier: 1,
					purchaseCost: 0,
					unlockCost: 0,
					unlockLevelRequirement: 0,
					purchaseLevelRequirement: 0
				},
				{
					id: 'cargo_bike',
					level: 1,
					name: 'Cargo Bike',
					capacity: 40,
					roadSpeed: 20,
					tier: 2,
					purchaseCost: 10,
					unlockCost: 20,
					unlockLevelRequirement: 1,
					purchaseLevelRequirement: 1
				}
			];
			const upgrades: UpgradeConfig[] = [
				{
					id: 'wrong_effect',
					name: 'Wrong Effect',
					upgradeRequirements: [],
					levelRequirements: { total: 1 },
					description: 'Wrong effect type',
					cost: 10,
					effect: 'multiply', // Wrong effect type
					effectArguments: { name: 'vehicleLevelMax', amount: 1 }
				},
				{
					id: 'wrong_name',
					name: 'Wrong Name',
					upgradeRequirements: [],
					levelRequirements: { total: 1 },
					description: 'Wrong name',
					cost: 10,
					effect: 'set',
					effectArguments: { name: 'speed', amount: 1 } // Wrong effect name
				}
			];
			// None of these upgrades count as vehicle unlock upgrades
			// Level 0 is pre-unlocked, so we need 1 upgrade for level 1
			expect(() => validateVehicleUpgradeRelationship(vehicles, upgrades)).toThrow(
				/Need at least 1 vehicle unlock upgrades/
			);
		});
	});
});
