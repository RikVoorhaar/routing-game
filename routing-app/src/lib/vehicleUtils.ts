/**
 * Shared vehicle utilities that work on both client and server
 * Accepts VehiclesConfig as a parameter instead of importing server-only code
 */

import type { VehicleConfig, VehiclesConfig } from '$lib/config/types';

/**
 * Build a mapping from vehicle level to vehicle config
 * This is computed from the provided vehicles config
 */
function buildVehicleLevelMapping(vehiclesConfig: VehiclesConfig): Map<number, VehicleConfig> {
	const mapping = new Map<number, VehicleConfig>();
	for (const vehicle of vehiclesConfig.vehicles) {
		mapping.set(vehicle.level, vehicle);
	}
	return mapping;
}

/**
 * Get vehicle config by level from vehicles config
 */
export function getVehicleConfigByLevel(
	level: number,
	vehiclesConfig: VehiclesConfig
): VehicleConfig | null {
	const mapping = buildVehicleLevelMapping(vehiclesConfig);
	return mapping.get(level) || null;
}

/**
 * Get vehicle tier by level
 */
export function getVehicleTierByLevel(level: number, vehiclesConfig: VehiclesConfig): number {
	const vehicle = getVehicleConfigByLevel(level, vehiclesConfig);
	return vehicle?.tier ?? 1; // Default to tier 1 if not found
}

/**
 * Get vehicle capacity by level
 */
export function getVehicleCapacityByLevel(level: number, vehiclesConfig: VehiclesConfig): number {
	const vehicle = getVehicleConfigByLevel(level, vehiclesConfig);
	return vehicle?.capacity ?? 10; // Default to 10 if not found
}

/**
 * Get vehicle road speed by level
 */
export function getVehicleRoadSpeedByLevel(level: number, vehiclesConfig: VehiclesConfig): number {
	const vehicle = getVehicleConfigByLevel(level, vehiclesConfig);
	return vehicle?.roadSpeed ?? 15; // Default to 15 if not found
}

/**
 * Get vehicle name by level
 */
export function getVehicleNameByLevel(level: number, vehiclesConfig: VehiclesConfig): string {
	const vehicle = getVehicleConfigByLevel(level, vehiclesConfig);
	return vehicle?.name ?? 'Unknown Vehicle';
}
