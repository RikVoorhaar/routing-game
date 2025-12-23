/**
 * Employee utilities for the new employee system
 */

import { JobCategory } from './jobs/jobCategories';
import type { Employee } from '$lib/server/db/schema';
import { VehicleType, LicenseType, VehicleClass, getVehicleConfig } from './upgrades/vehicles';
import {
	getDefaultCategoryLevels,
	getDefaultCategoryUpgrades,
	getDefaultDrivingLevel,
	canDoJobCategory
} from './upgrades/upgrades';

export interface NewEmployeeData {
	gameId: string;
	name: string;
	vehicleLevel?: VehicleType;
	licenseLevel?: LicenseType;
}

/**
 * Create default employee data for new employees
 */
export function createDefaultEmployee(
	data: NewEmployeeData
): Omit<Employee, 'id' | 'location' | 'activeJobId'> {
	return {
		gameId: data.gameId,
		name: data.name,
		vehicleLevel: data.vehicleLevel ?? VehicleType.BIKE,
		licenseLevel: data.licenseLevel ?? LicenseType.UNLICENSED,
		categoryLevel: getDefaultCategoryLevels(),
		drivingLevel: getDefaultDrivingLevel(),
		upgradeState: getDefaultCategoryUpgrades()
	};
}

/**
 * Get employee's current vehicle configuration
 */
export function getEmployeeVehicleConfig(employee: Employee) {
	return getVehicleConfig(employee.vehicleLevel);
}

/**
 * Get employee's current vehicle class
 */
export function getEmployeeVehicleClass(employee: Employee): VehicleClass {
	return getVehicleConfig(employee.vehicleLevel).vehicleClass;
}

/**
 * Check if employee can do a specific job category
 */
export function canEmployeeDoJobCategory(employee: Employee, jobCategory: JobCategory): boolean {
	const vehicleClass = getEmployeeVehicleClass(employee);
	return canDoJobCategory(jobCategory, employee.licenseLevel, vehicleClass);
}

/**
 * Get employee's capacity including upgrades
 * Uses default upgrade values (can be overridden server-side)
 */
export function getEmployeeCapacity(employee: Employee, capacityPerLevel: number = 0.05): number {
	const baseCapacity = getVehicleConfig(employee.vehicleLevel).capacity;
	const furnitureUpgradeLevel = employee.upgradeState[JobCategory.FURNITURE];
	const furnitureCapacityBonus = furnitureUpgradeLevel * capacityPerLevel;

	return Math.floor(baseCapacity * (1 + furnitureCapacityBonus));
}

/**
 * Get employee's effective max speed including upgrades
 * Uses default upgrade values (can be overridden server-side)
 */
export function getEmployeeMaxSpeed(employee: Employee, maxSpeedPerLevel: number = 5): number {
	const baseMaxSpeed = getVehicleConfig(employee.vehicleLevel).maxSpeed;
	const fragileGoodsUpgradeLevel = employee.upgradeState[JobCategory.FRAGILE_GOODS];
	const speedBonus = fragileGoodsUpgradeLevel * maxSpeedPerLevel;

	return baseMaxSpeed + speedBonus;
}

/**
 * Get employee's distance-based earnings multiplier
 * Uses default upgrade values (can be overridden server-side)
 */
export function getDistanceEarningsMultiplier(employee: Employee, perLevel: number = 0.05): number {
	const groceriesUpgradeLevel = employee.upgradeState[JobCategory.GROCERIES];
	return 1 + groceriesUpgradeLevel * perLevel;
}

/**
 * Get employee's time-based earnings multiplier
 * Uses default upgrade values (can be overridden server-side)
 */
export function getTimeEarningsMultiplier(employee: Employee, perLevel: number = 0.05): number {
	const foodUpgradeLevel = employee.upgradeState[JobCategory.FOOD];
	return 1 + foodUpgradeLevel * perLevel;
}

/**
 * Get employee's XP gain multiplier
 * Uses default upgrade values (can be overridden server-side)
 */
export function getXPGainMultiplier(employee: Employee, perLevel: number = 0.1): number {
	const peopleUpgradeLevel = employee.upgradeState[JobCategory.PEOPLE];
	return 1 + peopleUpgradeLevel * perLevel;
}

/**
 * Get employee's route time reduction multiplier
 * Uses default upgrade values (can be overridden server-side)
 */
export function getRouteTimeMultiplier(employee: Employee, perLevel: number = 0.05): number {
	const liquidsUpgradeLevel = employee.upgradeState[JobCategory.LIQUIDS];
	return 1 - liquidsUpgradeLevel * perLevel;
}

/**
 * Get employee's node-to-address time reduction multiplier
 * Uses default upgrade values (can be overridden server-side)
 */
export function getNodeToAddressTimeMultiplier(employee: Employee, perLevel: number = 0.2): number {
	const packagesUpgradeLevel = employee.upgradeState[JobCategory.PACKAGES];
	return 1 - packagesUpgradeLevel * perLevel;
}

/**
 * Get employee's upgrade cost reduction multiplier
 * Uses default upgrade values (can be overridden server-side)
 */
export function getUpgradeCostMultiplier(employee: Employee, perLevel: number = 0.1): number {
	const toxicGoodsUpgradeLevel = employee.upgradeState[JobCategory.TOXIC_GOODS];
	return 1 - toxicGoodsUpgradeLevel * perLevel;
}

/**
 * Get employee's maximum job capacity multiplier (for job eligibility)
 * Uses default upgrade values (can be overridden server-side)
 */
export function getMaxJobCapacityMultiplier(employee: Employee, perLevel: number = 0.2): number {
	const constructionUpgradeLevel = employee.upgradeState[JobCategory.CONSTRUCTION];
	return 1 + constructionUpgradeLevel * perLevel;
}

/**
 * Get all job categories this employee can currently handle
 */
export function getAvailableJobCategories(employee: Employee): JobCategory[] {
	return Object.values(JobCategory)
		.filter((category) => typeof category === 'number')
		.filter((category) =>
			canEmployeeDoJobCategory(employee, category as JobCategory)
		) as JobCategory[];
}

/**
 * Format employee summary for display
 */
export function formatEmployeeSummary(employee: Employee): string {
	const vehicleConfig = getEmployeeVehicleConfig(employee);
	const capacity = getEmployeeCapacity(employee);
	const maxSpeed = getEmployeeMaxSpeed(employee);

	return `${employee.name} - ${vehicleConfig.name} (${capacity} capacity, ${maxSpeed} km/h max)`;
}

/**
 * Computes the cost of hiring a new employee based on the number of existing employees
 * Formula: baseCost * (employeeCount ^ exponent)
 * The first employee is free if configured
 *
 * This is a client-safe version that uses default values.
 * Server-side code should use the config values directly.
 */
export function computeEmployeeCosts(
	existingEmployeeCount: number,
	baseCost: number = 100,
	exponent: number = 2,
	firstEmployeeFree: boolean = true
): number {
	if (existingEmployeeCount === 0 && firstEmployeeFree) {
		return 0; // First employee is free
	}
	return baseCost * Math.pow(existingEmployeeCount, exponent);
}

export const DEFAULT_EMPLOYEE_LOCATION = {
	id: '2709275418',
	lat: 52.0911907,
	lon: 5.1220287,
	street: 'Domplein',
	houseNumber: '1',
	city: 'Utrecht',
	postcode: '3512JC'
};
