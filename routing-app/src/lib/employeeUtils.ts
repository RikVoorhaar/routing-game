/**
 * Employee utilities for the new employee system
 */

import type { Employee } from '$lib/server/db/schema';
import { VEHICLE_DEFINITIONS } from './vehicles/vehicleDefinitions';
import { getVehicleRoadSpeedByLevel } from './vehicleUtils';

export interface NewEmployeeData {
	gameId: string;
	name: string;
	vehicleLevel?: number; // Vehicle level (0-based, from vehicle definitions)
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
		xp: 0, // Start with 0 XP
		order: 0 // Default order, will be set correctly when creating employee
	};
}

/**
 * Get employee's effective max speed including upgrades
 * Note: In the new upgrade system, upgrades are global (in gameState.upgradeEffects)
 * For now, this returns base max speed without upgrades
 * Uses vehicle definitions directly (available on both client and server)
 */
export function getEmployeeMaxSpeed(employee: Employee): number {
	return getVehicleRoadSpeedByLevel(employee.vehicleLevel, VEHICLE_DEFINITIONS);
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
	lat: 52.0911907,
	lon: 5.1220287
};
