/**
 * Vehicle system configuration
 */

import { JobCategory } from './jobs/jobCategories';

export enum VehicleType {
	BIKE = 0,
	BACKPACK = 1,
	SADDLEBAGS = 2,
	ELECTRIC_BIKE = 3,
	SCOOTER = 4,
	MICRO_CAR = 5,
	SEDAN = 6,
	HATCHBACK = 7,
	SMALL_VAN = 8,
	BIG_VAN = 9,
	TRAILER = 10,
	TRUCK = 11,
	SINGLE_TRAILER_TRUCK = 12,
	DOUBLE_TRAILER_TRUCK = 13
}

export enum VehicleClass {
	BIKE = 'Bike',
	SCOOTER = 'Scooter',
	CAR = 'Car',
	VAN = 'Van',
	TRUCK = 'Truck'
}

export enum LicenseType {
	UNLICENSED = 0,
	SCOOTER = 1,
	CAR = 2,
	TAXI = 3,
	FRAGILE_GOODS = 4,
	CONSTRUCTION = 5,
	TRUCKING = 6,
	LIQUID_GOODS = 7,
	TOXIC_GOODS = 8
}

export interface VehicleConfig {
	name: string;
	baseCost: number;
	capacity: number;
	maxSpeed: number;
	minLicenseLevel: LicenseType;
	vehicleClass: VehicleClass;
}

export interface LicenseConfig {
	name: string;
	minDrivingLevel: number;
	cost: number;
}

export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
	[VehicleType.BIKE]: {
		name: 'Bike',
		baseCost: 0,
		capacity: 10,
		maxSpeed: 15,
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.BACKPACK]: {
		name: 'Backpack',
		baseCost: 10,
		capacity: 20,
		maxSpeed: 15,
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.SADDLEBAGS]: {
		name: 'Saddlebags',
		baseCost: 15,
		capacity: 40,
		maxSpeed: 15,
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.ELECTRIC_BIKE]: {
		name: 'Electric bike',
		baseCost: 30,
		capacity: 40,
		maxSpeed: 25,
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.SCOOTER]: {
		name: 'Scooter',
		baseCost: 100,
		capacity: 50,
		maxSpeed: 45,
		minLicenseLevel: LicenseType.SCOOTER,
		vehicleClass: VehicleClass.SCOOTER
	},
	[VehicleType.MICRO_CAR]: {
		name: 'Micro car',
		baseCost: 200,
		capacity: 100,
		maxSpeed: 100,
		minLicenseLevel: LicenseType.CAR,
		vehicleClass: VehicleClass.CAR
	},
	[VehicleType.SEDAN]: {
		name: 'Sedan',
		baseCost: 300,
		capacity: 200,
		maxSpeed: 130,
		minLicenseLevel: LicenseType.CAR,
		vehicleClass: VehicleClass.CAR
	},
	[VehicleType.HATCHBACK]: {
		name: 'Hatchback',
		baseCost: 400,
		capacity: 300,
		maxSpeed: 130,
		minLicenseLevel: LicenseType.CAR,
		vehicleClass: VehicleClass.CAR
	},
	[VehicleType.SMALL_VAN]: {
		name: 'Small van',
		baseCost: 500,
		capacity: 500,
		maxSpeed: 120,
		minLicenseLevel: LicenseType.CONSTRUCTION,
		vehicleClass: VehicleClass.VAN
	},
	[VehicleType.BIG_VAN]: {
		name: 'Big van',
		baseCost: 750,
		capacity: 1000,
		maxSpeed: 120,
		minLicenseLevel: LicenseType.CONSTRUCTION,
		vehicleClass: VehicleClass.VAN
	},
	[VehicleType.TRAILER]: {
		name: 'Trailer',
		baseCost: 1000,
		capacity: 2000,
		maxSpeed: 100,
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	},
	[VehicleType.TRUCK]: {
		name: 'Truck',
		baseCost: 3000,
		capacity: 5000,
		maxSpeed: 100,
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	},
	[VehicleType.SINGLE_TRAILER_TRUCK]: {
		name: 'Single trailer truck',
		baseCost: 10000,
		capacity: 10000,
		maxSpeed: 90,
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	},
	[VehicleType.DOUBLE_TRAILER_TRUCK]: {
		name: 'Double trailer truck',
		baseCost: 20000,
		capacity: 15000,
		maxSpeed: 90,
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	}
};

export const LICENSE_CONFIGS: Record<LicenseType, LicenseConfig> = {
	[LicenseType.UNLICENSED]: {
		name: 'Unlicensed',
		minDrivingLevel: 0,
		cost: 0
	},
	[LicenseType.SCOOTER]: {
		name: 'Scooter',
		minDrivingLevel: 1,
		cost: 50
	},
	[LicenseType.CAR]: {
		name: 'Car',
		minDrivingLevel: 2,
		cost: 100
	},
	[LicenseType.TAXI]: {
		name: 'Taxi',
		minDrivingLevel: 3,
		cost: 500
	},
	[LicenseType.FRAGILE_GOODS]: {
		name: 'Fragile goods',
		minDrivingLevel: 4,
		cost: 500
	},
	[LicenseType.CONSTRUCTION]: {
		name: 'Construction',
		minDrivingLevel: 5,
		cost: 500
	},
	[LicenseType.TRUCKING]: {
		name: 'Trucking',
		minDrivingLevel: 6,
		cost: 1000
	},
	[LicenseType.LIQUID_GOODS]: {
		name: 'Liquid goods',
		minDrivingLevel: 7,
		cost: 2000
	},
	[LicenseType.TOXIC_GOODS]: {
		name: 'Toxic goods',
		minDrivingLevel: 8,
		cost: 3000
	}
};

/**
 * Get vehicle configuration by type
 */
export function getVehicleConfig(vehicleType: VehicleType): VehicleConfig {
	return VEHICLE_CONFIGS[vehicleType];
}

/**
 * Get license configuration by type
 */
export function getLicenseConfig(licenseType: LicenseType): LicenseConfig {
	return LICENSE_CONFIGS[licenseType];
}

/**
 * Get all vehicles available for a given license level
 */
export function getAvailableVehicles(licenseLevel: LicenseType): VehicleType[] {
	return Object.entries(VEHICLE_CONFIGS)
		.filter(([_, config]) => config.minLicenseLevel <= licenseLevel)
		.map(([vehicleType, _]) => parseInt(vehicleType) as VehicleType);
}

/**
 * Check if a vehicle is available for a given license level
 */
export function isVehicleAvailable(vehicleType: VehicleType, licenseLevel: LicenseType): boolean {
	return VEHICLE_CONFIGS[vehicleType].minLicenseLevel <= licenseLevel;
}
