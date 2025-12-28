/**
 * Shared vehicle utilities that work on both client and server
 * Accepts vehicle definitions array directly
 */

import type { VehicleConfig } from '$lib/config/types';

/**
 * Build a mapping from vehicle level to vehicle config
 * This is computed from the provided vehicle definitions array
 */
function buildVehicleLevelMapping(vehicles: VehicleConfig[]): Map<number, VehicleConfig> {
	const mapping = new Map<number, VehicleConfig>();
	for (const vehicle of vehicles) {
		mapping.set(vehicle.level, vehicle);
	}
	return mapping;
}

/**
 * Get vehicle config by level from vehicle definitions array
 */
export function getVehicleConfigByLevel(
	level: number,
	vehicles: VehicleConfig[]
): VehicleConfig | null {
	const mapping = buildVehicleLevelMapping(vehicles);
	return mapping.get(level) || null;
}

/**
 * Get vehicle tier by level
 */
export function getVehicleTierByLevel(level: number, vehicles: VehicleConfig[]): number {
	const vehicle = getVehicleConfigByLevel(level, vehicles);
	return vehicle?.tier ?? 1; // Default to tier 1 if not found
}

/**
 * Get vehicle capacity by level
 */
export function getVehicleCapacityByLevel(level: number, vehicles: VehicleConfig[]): number {
	const vehicle = getVehicleConfigByLevel(level, vehicles);
	return vehicle?.capacity ?? 10; // Default to 10 if not found
}

/**
 * Get vehicle road speed by level
 */
export function getVehicleRoadSpeedByLevel(level: number, vehicles: VehicleConfig[]): number {
	const vehicle = getVehicleConfigByLevel(level, vehicles);
	return vehicle?.roadSpeed ?? 15; // Default to 15 if not found
}

