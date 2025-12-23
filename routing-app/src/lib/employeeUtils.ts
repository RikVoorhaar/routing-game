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
import { config } from '$lib/server/config';

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
 */
export function getEmployeeCapacity(employee: Employee): number {
	const baseCapacity = getVehicleConfig(employee.vehicleLevel).capacity;
	const furnitureUpgradeLevel = employee.upgradeState[JobCategory.FURNITURE];
	const furnitureCapacityBonus = furnitureUpgradeLevel * config.upgrades.effects.FURNITURE.capacityPerLevel;

	return Math.floor(baseCapacity * (1 + furnitureCapacityBonus));
}

/**
 * Get employee's effective max speed including upgrades
 */
export function getEmployeeMaxSpeed(employee: Employee): number {
	const baseMaxSpeed = getVehicleConfig(employee.vehicleLevel).maxSpeed;
	const fragileGoodsUpgradeLevel = employee.upgradeState[JobCategory.FRAGILE_GOODS];
	const speedBonus = fragileGoodsUpgradeLevel * config.upgrades.effects.FRAGILE_GOODS.maxSpeedPerLevel;

	return baseMaxSpeed + speedBonus;
}

/**
 * Get employee's distance-based earnings multiplier
 */
export function getDistanceEarningsMultiplier(employee: Employee): number {
	const groceriesUpgradeLevel = employee.upgradeState[JobCategory.GROCERIES];
	return 1 + groceriesUpgradeLevel * config.upgrades.effects.GROCERIES.distanceEarningsPerLevel;
}

/**
 * Get employee's time-based earnings multiplier
 */
export function getTimeEarningsMultiplier(employee: Employee): number {
	const foodUpgradeLevel = employee.upgradeState[JobCategory.FOOD];
	return 1 + foodUpgradeLevel * config.upgrades.effects.FOOD.timeEarningsPerLevel;
}

/**
 * Get employee's XP gain multiplier
 */
export function getXPGainMultiplier(employee: Employee): number {
	const peopleUpgradeLevel = employee.upgradeState[JobCategory.PEOPLE];
	return 1 + peopleUpgradeLevel * config.upgrades.effects.PEOPLE.xpGainPerLevel;
}

/**
 * Get employee's route time reduction multiplier
 */
export function getRouteTimeMultiplier(employee: Employee): number {
	const liquidsUpgradeLevel = employee.upgradeState[JobCategory.LIQUIDS];
	return 1 - liquidsUpgradeLevel * config.upgrades.effects.LIQUIDS.routeTimeReductionPerLevel;
}

/**
 * Get employee's node-to-address time reduction multiplier
 */
export function getNodeToAddressTimeMultiplier(employee: Employee): number {
	const packagesUpgradeLevel = employee.upgradeState[JobCategory.PACKAGES];
	return 1 - packagesUpgradeLevel * config.upgrades.effects.PACKAGES.nodeToAddressTimeReductionPerLevel;
}

/**
 * Get employee's upgrade cost reduction multiplier
 */
export function getUpgradeCostMultiplier(employee: Employee): number {
	const toxicGoodsUpgradeLevel = employee.upgradeState[JobCategory.TOXIC_GOODS];
	return 1 - toxicGoodsUpgradeLevel * config.upgrades.effects.TOXIC_GOODS.upgradeCostReductionPerLevel;
}

/**
 * Get employee's maximum job capacity multiplier (for job eligibility)
 */
export function getMaxJobCapacityMultiplier(employee: Employee): number {
	const constructionUpgradeLevel = employee.upgradeState[JobCategory.CONSTRUCTION];
	return 1 + constructionUpgradeLevel * config.upgrades.effects.CONSTRUCTION.maxJobCapacityPerLevel;
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
 */
export function computeEmployeeCosts(existingEmployeeCount: number): number {
	if (existingEmployeeCount === 0 && config.employees.hiring.firstEmployeeFree) {
		return 0; // First employee is free
	}
	return config.employees.hiring.baseCost * Math.pow(existingEmployeeCount, config.employees.hiring.exponent);
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
