/**
 * Server-side vehicle utilities for the new upgrade system
 * Re-exports shared utilities with server config pre-loaded for convenience
 */

import { vehiclesConfig } from './config';
import * as sharedVehicleUtils from '$lib/vehicleUtils';

/**
 * Get vehicle config by level from vehicles.yaml
 * Convenience wrapper that uses server-loaded config
 */
export function getVehicleConfigByLevel(level: number) {
	return sharedVehicleUtils.getVehicleConfigByLevel(level, vehiclesConfig);
}

/**
 * Get vehicle tier by level
 * Convenience wrapper that uses server-loaded config
 */
export function getVehicleTierByLevel(level: number): number {
	return sharedVehicleUtils.getVehicleTierByLevel(level, vehiclesConfig);
}

/**
 * Get vehicle capacity by level
 * Convenience wrapper that uses server-loaded config
 */
export function getVehicleCapacityByLevel(level: number): number {
	return sharedVehicleUtils.getVehicleCapacityByLevel(level, vehiclesConfig);
}

/**
 * Get vehicle road speed by level
 * Convenience wrapper that uses server-loaded config
 */
export function getVehicleRoadSpeedByLevel(level: number): number {
	return sharedVehicleUtils.getVehicleRoadSpeedByLevel(level, vehiclesConfig);
}

/**
 * Get vehicle name by level
 * Convenience wrapper that uses server-loaded config
 */
export function getVehicleNameByLevel(level: number): string {
	return sharedVehicleUtils.getVehicleNameByLevel(level, vehiclesConfig);
}
