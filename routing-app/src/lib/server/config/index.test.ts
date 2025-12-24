import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load } from 'js-yaml';
import type { UpgradesConfig, VehiclesConfig } from '$lib/config/types';
import {
	validateUpgradesConfig,
	validateVehiclesConfig,
	validateVehicleUpgradeRelationship
} from './index';

/**
 * Get the directory of the current file (for resolving test asset paths)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testAssetsPath = join(__dirname, '__tests__', 'test-assets');

/**
 * Helper function to load a test YAML file
 */
function loadTestYaml(filename: string): unknown {
	const filePath = join(testAssetsPath, filename);
	const fileContents = readFileSync(filePath, 'utf-8');
	return load(fileContents);
}

describe('Config Loading and Validation', () => {
	describe('validateUpgradesConfig', () => {
		it('should validate a valid upgrades config', () => {
			const config = loadTestYaml('valid-upgrades.yaml') as UpgradesConfig;
			expect(() => validateUpgradesConfig(config)).not.toThrow();
			expect(config.upgrades).toHaveLength(3);
			expect(config.upgrades[0].id).toBe('unlock_cargo_bike');
		});

		it('should reject config with missing upgrades array', () => {
			const config = { upgrades: null } as unknown as UpgradesConfig;
			expect(() => validateUpgradesConfig(config)).toThrow(/upgrades must be an array/);
		});

		it('should reject config with upgrade missing required fields', () => {
			const config = loadTestYaml('invalid-upgrades-missing-field.yaml') as UpgradesConfig;
			expect(() => validateUpgradesConfig(config)).toThrow(/name must be a non-empty string/);
		});

		it('should reject config with upgrade having wrong field types', () => {
			const config = loadTestYaml('invalid-upgrades-wrong-type.yaml') as UpgradesConfig;
			expect(() => validateUpgradesConfig(config)).toThrow(/cost must be a non-negative number/);
		});

		it('should reject config with duplicate upgrade IDs', () => {
			const config: UpgradesConfig = {
				upgrades: [
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
				]
			};
			expect(() => validateUpgradesConfig(config)).toThrow(/Duplicate upgrade ID/);
		});

		it('should reject config with invalid effect type', () => {
			const config: UpgradesConfig = {
				upgrades: [
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
				]
			};
			expect(() => validateUpgradesConfig(config)).toThrow(
				/effect must be either 'multiply' or 'increment'/
			);
		});

		it('should reject config with invalid effectArguments', () => {
			const config: UpgradesConfig = {
				upgrades: [
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
				]
			};
			expect(() => validateUpgradesConfig(config)).toThrow(/effectArguments must be an object/);
		});

		it('should reject config with negative cost', () => {
			const config: UpgradesConfig = {
				upgrades: [
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
				]
			};
			expect(() => validateUpgradesConfig(config)).toThrow(/cost must be a non-negative number/);
		});
	});

	describe('validateVehiclesConfig', () => {
		it('should validate a valid vehicles config', () => {
			const config = loadTestYaml('valid-vehicles.yaml') as VehiclesConfig;
			expect(() => validateVehiclesConfig(config)).not.toThrow();
			expect(config.vehicles).toHaveLength(3);
			expect(config.vehicles[0].level).toBe(0);
			expect(config.vehicles[0].name).toBe('Bike');
		});

		it('should reject config with missing vehicles array', () => {
			const config = { vehicles: null } as unknown as VehiclesConfig;
			expect(() => validateVehiclesConfig(config)).toThrow(/vehicles must be an array/);
		});

		it('should reject config with duplicate vehicle levels', () => {
			const config = loadTestYaml('invalid-vehicles-duplicate-level.yaml') as VehiclesConfig;
			expect(() => validateVehiclesConfig(config)).toThrow(/Duplicate vehicle level: 1/);
		});

		it('should reject config missing level 0 vehicle', () => {
			const config = loadTestYaml('invalid-vehicles-missing-level-zero.yaml') as VehiclesConfig;
			// This should pass vehicle validation, but fail relationship validation
			expect(() => validateVehiclesConfig(config)).not.toThrow();
		});

		it('should reject config with negative vehicle level', () => {
			const config: VehiclesConfig = {
				vehicles: [
					{
						level: -1,
						name: 'Invalid',
						capacity: 10,
						roadSpeed: 15,
						tier: 1
					}
				]
			};
			expect(() => validateVehiclesConfig(config)).toThrow(/level must be a non-negative number/);
		});

		it('should reject config with invalid capacity', () => {
			const config: VehiclesConfig = {
				vehicles: [
					{
						level: 0,
						name: 'Test',
						capacity: 0, // Invalid: must be positive
						roadSpeed: 15,
						tier: 1
					}
				]
			};
			expect(() => validateVehiclesConfig(config)).toThrow(/capacity must be a positive number/);
		});

		it('should reject config with invalid roadSpeed', () => {
			const config: VehiclesConfig = {
				vehicles: [
					{
						level: 0,
						name: 'Test',
						capacity: 10,
						roadSpeed: -5, // Invalid: must be positive
						tier: 1
					}
				]
			};
			expect(() => validateVehiclesConfig(config)).toThrow(/roadSpeed must be a positive number/);
		});

		it('should reject config with invalid tier', () => {
			const config: VehiclesConfig = {
				vehicles: [
					{
						level: 0,
						name: 'Test',
						capacity: 10,
						roadSpeed: 15,
						tier: 0 // Invalid: must be >= 1
					}
				]
			};
			expect(() => validateVehiclesConfig(config)).toThrow(/tier must be >= 1/);
		});

		it('should reject config with missing vehicle name', () => {
			const config: VehiclesConfig = {
				vehicles: [
					{
						level: 0,
						name: '', // Invalid: must be non-empty
						capacity: 10,
						roadSpeed: 15,
						tier: 1
					}
				]
			};
			expect(() => validateVehiclesConfig(config)).toThrow(/name must be a non-empty string/);
		});
	});

	describe('validateVehicleUpgradeRelationship', () => {
		it('should validate a valid vehicle-upgrade relationship', () => {
			const vehiclesConfig = loadTestYaml('valid-vehicles.yaml') as VehiclesConfig;
			const upgradesConfig = loadTestYaml('valid-upgrades.yaml') as UpgradesConfig;
			expect(() =>
				validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig)
			).not.toThrow();
		});

		it('should reject when there are insufficient vehicle unlock upgrades', () => {
			const vehiclesConfig = loadTestYaml('valid-vehicles.yaml') as VehiclesConfig;
			const upgradesConfig = loadTestYaml(
				'invalid-relationship-insufficient-upgrades.yaml'
			) as UpgradesConfig;
			expect(() => validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig)).toThrow(
				/Need at least 2 vehicle unlock upgrades/
			);
		});

		it('should reject when level 0 vehicle is missing', () => {
			const vehiclesConfig = loadTestYaml(
				'invalid-vehicles-missing-level-zero.yaml'
			) as VehiclesConfig;
			const upgradesConfig = loadTestYaml('valid-upgrades.yaml') as UpgradesConfig;
			expect(() => validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig)).toThrow(
				/Vehicle level 0 must exist/
			);
		});

		it('should accept config with exact number of unlock upgrades needed', () => {
			const vehiclesConfig: VehiclesConfig = {
				vehicles: [
					{ level: 0, name: 'Bike', capacity: 10, roadSpeed: 15, tier: 1 },
					{ level: 1, name: 'Cargo Bike', capacity: 40, roadSpeed: 20, tier: 2 }
				]
			};
			const upgradesConfig: UpgradesConfig = {
				upgrades: [
					{
						id: 'unlock_cargo_bike',
						name: 'Cargo Bike',
						upgradeRequirements: [],
						levelRequirements: { total: 1 },
						description: 'Unlocks cargo bike',
						cost: 10,
						effect: 'increment',
						effectArguments: { name: 'vehicleLevelMax', amount: 1 }
					}
				]
			};
			expect(() =>
				validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig)
			).not.toThrow();
		});

		it('should accept config with more unlock upgrades than needed', () => {
			const vehiclesConfig: VehiclesConfig = {
				vehicles: [
					{ level: 0, name: 'Bike', capacity: 10, roadSpeed: 15, tier: 1 },
					{ level: 1, name: 'Cargo Bike', capacity: 40, roadSpeed: 20, tier: 2 }
				]
			};
			const upgradesConfig: UpgradesConfig = {
				upgrades: [
					{
						id: 'unlock_cargo_bike',
						name: 'Cargo Bike',
						upgradeRequirements: [],
						levelRequirements: { total: 1 },
						description: 'Unlocks cargo bike',
						cost: 10,
						effect: 'increment',
						effectArguments: { name: 'vehicleLevelMax', amount: 1 }
					},
					{
						id: 'unlock_electric_bike',
						name: 'Electric Bike',
						upgradeRequirements: ['unlock_cargo_bike'],
						levelRequirements: { total: 3 },
						description: 'Unlocks electric bike',
						cost: 25,
						effect: 'increment',
						effectArguments: { name: 'vehicleLevelMax', amount: 1 }
					}
				]
			};
			expect(() =>
				validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig)
			).not.toThrow();
		});

		it('should only count upgrades that increment vehicleLevelMax by 1', () => {
			const vehiclesConfig: VehiclesConfig = {
				vehicles: [
					{ level: 0, name: 'Bike', capacity: 10, roadSpeed: 15, tier: 1 },
					{ level: 1, name: 'Cargo Bike', capacity: 40, roadSpeed: 20, tier: 2 }
				]
			};
			const upgradesConfig: UpgradesConfig = {
				upgrades: [
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
						id: 'wrong_amount',
						name: 'Wrong Amount',
						upgradeRequirements: [],
						levelRequirements: { total: 1 },
						description: 'Wrong amount',
						cost: 10,
						effect: 'increment',
						effectArguments: { name: 'vehicleLevelMax', amount: 2 } // Wrong amount
					},
					{
						id: 'wrong_name',
						name: 'Wrong Name',
						upgradeRequirements: [],
						levelRequirements: { total: 1 },
						description: 'Wrong name',
						cost: 10,
						effect: 'increment',
						effectArguments: { name: 'speed', amount: 1 } // Wrong effect name
					}
				]
			};
			// None of these upgrades count as vehicle unlock upgrades
			expect(() => validateVehicleUpgradeRelationship(vehiclesConfig, upgradesConfig)).toThrow(
				/Need at least 1 vehicle unlock upgrades/
			);
		});
	});
});
