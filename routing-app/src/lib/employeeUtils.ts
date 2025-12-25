/**
 * Employee utilities for the new employee system
 */

import { JobCategory } from './jobs/jobCategories';
import type { Employee } from '$lib/server/db/schema';
import { VehicleType, VehicleClass, LicenseType, getVehicleConfig } from './upgrades/vehicles';

export interface NewEmployeeData {
	gameId: string;
	name: string;
	vehicleLevel?: number; // Vehicle level (0-based, from vehicles.yaml)
}

/**
 * Create default employee data for new employees
 * New upgrade system: employees only have vehicleLevel and xp
 */
export function createDefaultEmployee(
	data: NewEmployeeData
): Omit<Employee, 'id' | 'location' | 'activeJobId'> {
	return {
		gameId: data.gameId,
		name: data.name,
		vehicleLevel: data.vehicleLevel ?? 0, // Default to level 0 (Bike)
		xp: 0 // Start with 0 XP
	};
}

/**
 * Get employee's current vehicle configuration
 * Uses vehicles.yaml config on server-side, falls back to old VehicleType enum on client-side
 */
export function getEmployeeVehicleConfig(employee: Employee) {
	// Try to use server-side vehicles.yaml config if available
	if (typeof window === 'undefined') {
		// Server-side: use vehicles.yaml config via direct import
		// Use a function that can be called synchronously
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const vehicleUtils = require('$lib/server/vehicleUtils');
			const config = vehicleUtils.getVehicleConfigByLevel(employee.vehicleLevel);
			if (config) {
				// Convert new VehicleConfig format to old format for compatibility
				return {
					name: config.name,
					capacity: config.capacity,
					maxSpeed: config.roadSpeed,
					baseCost: 0, // Not in new config, use 0
					minLicenseLevel: LicenseType.UNLICENSED, // Not in new config, use default
					vehicleClass: VehicleClass.BIKE // Not in new config, default to BIKE
				};
			}
		} catch {
			// Fall through to fallback
		}
	}

	// Fallback: Cast vehicle level to VehicleType enum for compatibility
	// This works because VehicleType enum values match vehicle levels (0=BIKE, 1=BACKPACK, etc.)
	const vehicleType = employee.vehicleLevel as VehicleType;
	return getVehicleConfig(vehicleType);
}

/**
 * Get employee's current vehicle class
 * Uses vehicles.yaml config on server-side, falls back to old VehicleType enum on client-side
 */
export function getEmployeeVehicleClass(employee: Employee): VehicleClass {
	// Try to use server-side vehicles.yaml config if available
	if (typeof window === 'undefined') {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const vehicleUtils = require('$lib/server/vehicleUtils');
			const config = vehicleUtils.getVehicleConfigByLevel(employee.vehicleLevel);
			if (config) {
				// Map tier to vehicle class (simplified mapping)
				// Tier 1-2 = BIKE, Tier 3 = SCOOTER, Tier 4+ = CAR/VAN/TRUCK
				if (config.tier <= 2) return VehicleClass.BIKE;
				if (config.tier === 3) return VehicleClass.SCOOTER;
				return VehicleClass.CAR; // Default for higher tiers
			}
		} catch {
			// Fall through to fallback
		}
	}

	// Fallback: Cast vehicle level to VehicleType enum
	const vehicleType = employee.vehicleLevel as VehicleType;
	return getVehicleConfig(vehicleType).vehicleClass;
}

/**
 * Check if employee can do a specific job category
 * @deprecated This function is no longer used in the new upgrade system
 * Job eligibility is now based on vehicle tier vs job tier
 * This function is kept for backward compatibility but always returns true
 */
export function canEmployeeDoJobCategory(_employee: Employee, _jobCategory: JobCategory): boolean {
	// In the new system, this check is done via vehicle tier in employeeCanPerformJob
	// This function is kept for backward compatibility but always returns true
	// (actual filtering happens via vehicle tier check)
	return true;
}

/**
 * Get employee's capacity including upgrades
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, this returns base capacity without upgrades
 * Uses vehicles.yaml config on server-side
 */
export function getEmployeeCapacity(employee: Employee, _capacityPerLevel: number = 0.05): number {
	// Try to use server-side vehicles.yaml config if available
	if (typeof window === 'undefined') {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const vehicleUtils = require('$lib/server/vehicleUtils');
			return vehicleUtils.getVehicleCapacityByLevel(employee.vehicleLevel);
		} catch {
			// Fall through to fallback
		}
	}

	// Fallback: Cast vehicle level to VehicleType enum
	const vehicleType = employee.vehicleLevel as VehicleType;
	return getVehicleConfig(vehicleType).capacity;
}

/**
 * Get employee's effective max speed including upgrades
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, this returns base max speed without upgrades
 * Uses vehicles.yaml config on server-side
 */
export function getEmployeeMaxSpeed(employee: Employee, _maxSpeedPerLevel: number = 5): number {
	// Try to use server-side vehicles.yaml config if available
	if (typeof window === 'undefined') {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const vehicleUtils = require('$lib/server/vehicleUtils');
			return vehicleUtils.getVehicleRoadSpeedByLevel(employee.vehicleLevel);
		} catch {
			// Fall through to fallback
		}
	}

	// Fallback: Cast vehicle level to VehicleType enum
	const vehicleType = employee.vehicleLevel as VehicleType;
	return getVehicleConfig(vehicleType).maxSpeed;
}

/**
 * Get employee's distance-based earnings multiplier
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no multiplier)
 */
export function getDistanceEarningsMultiplier(
	_employee: Employee,
	_perLevel: number = 0.05
): number {
	return 1.0;
}

/**
 * Get employee's time-based earnings multiplier
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no multiplier)
 */
export function getTimeEarningsMultiplier(_employee: Employee, _perLevel: number = 0.05): number {
	return 1.0;
}

/**
 * Get employee's XP gain multiplier
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no multiplier)
 */
export function getXPGainMultiplier(_employee: Employee, _perLevel: number = 0.1): number {
	return 1.0;
}

/**
 * Get employee's route time reduction multiplier
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no reduction)
 */
export function getRouteTimeMultiplier(_employee: Employee, _perLevel: number = 0.05): number {
	return 1.0;
}

/**
 * Get employee's node-to-address time reduction multiplier
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no reduction)
 */
export function getNodeToAddressTimeMultiplier(
	_employee: Employee,
	_perLevel: number = 0.2
): number {
	return 1.0;
}

/**
 * Get employee's upgrade cost reduction multiplier
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no reduction)
 */
export function getUpgradeCostMultiplier(_employee: Employee, _perLevel: number = 0.1): number {
	return 1.0;
}

/**
 * Get employee's maximum job capacity multiplier (for job eligibility)
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, returns 1.0 (no multiplier)
 */
export function getMaxJobCapacityMultiplier(_employee: Employee, _perLevel: number = 0.2): number {
	return 1.0;
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
