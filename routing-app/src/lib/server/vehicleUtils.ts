/**
 * Server-side vehicle utilities for the new upgrade system
 * Re-exports shared utilities with vehicle definitions pre-loaded for convenience
 */

import { VEHICLE_DEFINITIONS } from '$lib/vehicles/vehicleDefinitions';
import * as sharedVehicleUtils from '$lib/vehicleUtils';

/**
 * Get vehicle config by level from vehicle definitions
 * Convenience wrapper that uses server-loaded definitions
 */
export function getVehicleConfigByLevel(level: number) {
	return sharedVehicleUtils.getVehicleConfigByLevel(level, VEHICLE_DEFINITIONS);
}

/**
 * Get vehicle tier by level
 * Convenience wrapper that uses server-loaded definitions
 */
export function getVehicleTierByLevel(level: number): number {
	return sharedVehicleUtils.getVehicleTierByLevel(level, VEHICLE_DEFINITIONS);
}

/**
 * Get vehicle capacity by level
 * Convenience wrapper that uses server-loaded definitions
 */
export function getVehicleCapacityByLevel(level: number): number {
	return sharedVehicleUtils.getVehicleCapacityByLevel(level, VEHICLE_DEFINITIONS);
}

/**
 * Get vehicle road speed by level
 * Convenience wrapper that uses server-loaded definitions
 */
export function getVehicleRoadSpeedByLevel(level: number): number {
	return sharedVehicleUtils.getVehicleRoadSpeedByLevel(level, VEHICLE_DEFINITIONS);
}

/**
 * Get vehicle name by level
 * Convenience wrapper that uses server-loaded definitions
 */
export function getVehicleNameByLevel(level: number): string {
	return sharedVehicleUtils.getVehicleNameByLevel(level, VEHICLE_DEFINITIONS);
}
