/**
 * Vehicle system configuration
 */

import { config } from '$lib/server/config';

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

// Vehicle metadata (not in config - these are structural)
const VEHICLE_METADATA: Record<VehicleType, { name: string; minLicenseLevel: LicenseType; vehicleClass: VehicleClass }> = {
	[VehicleType.BIKE]: {
		name: 'Bike',
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.BACKPACK]: {
		name: 'Backpack',
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.SADDLEBAGS]: {
		name: 'Saddlebags',
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.ELECTRIC_BIKE]: {
		name: 'Electric bike',
		minLicenseLevel: LicenseType.UNLICENSED,
		vehicleClass: VehicleClass.BIKE
	},
	[VehicleType.SCOOTER]: {
		name: 'Scooter',
		minLicenseLevel: LicenseType.SCOOTER,
		vehicleClass: VehicleClass.SCOOTER
	},
	[VehicleType.MICRO_CAR]: {
		name: 'Micro car',
		minLicenseLevel: LicenseType.CAR,
		vehicleClass: VehicleClass.CAR
	},
	[VehicleType.SEDAN]: {
		name: 'Sedan',
		minLicenseLevel: LicenseType.CAR,
		vehicleClass: VehicleClass.CAR
	},
	[VehicleType.HATCHBACK]: {
		name: 'Hatchback',
		minLicenseLevel: LicenseType.CAR,
		vehicleClass: VehicleClass.CAR
	},
	[VehicleType.SMALL_VAN]: {
		name: 'Small van',
		minLicenseLevel: LicenseType.CONSTRUCTION,
		vehicleClass: VehicleClass.VAN
	},
	[VehicleType.BIG_VAN]: {
		name: 'Big van',
		minLicenseLevel: LicenseType.CONSTRUCTION,
		vehicleClass: VehicleClass.VAN
	},
	[VehicleType.TRAILER]: {
		name: 'Trailer',
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	},
	[VehicleType.TRUCK]: {
		name: 'Truck',
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	},
	[VehicleType.SINGLE_TRAILER_TRUCK]: {
		name: 'Single trailer truck',
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	},
	[VehicleType.DOUBLE_TRAILER_TRUCK]: {
		name: 'Double trailer truck',
		minLicenseLevel: LicenseType.TRUCKING,
		vehicleClass: VehicleClass.TRUCK
	}
};

// Build vehicle configs from YAML config and metadata
function buildVehicleConfigs(): Record<VehicleType, VehicleConfig> {
	const configs = {} as Record<VehicleType, VehicleConfig>;
	
	// Map enum values to their string keys
	const vehicleTypeKeys: Record<VehicleType, keyof typeof VehicleType> = {
		[VehicleType.BIKE]: 'BIKE',
		[VehicleType.BACKPACK]: 'BACKPACK',
		[VehicleType.SADDLEBAGS]: 'SADDLEBAGS',
		[VehicleType.ELECTRIC_BIKE]: 'ELECTRIC_BIKE',
		[VehicleType.SCOOTER]: 'SCOOTER',
		[VehicleType.MICRO_CAR]: 'MICRO_CAR',
		[VehicleType.SEDAN]: 'SEDAN',
		[VehicleType.HATCHBACK]: 'HATCHBACK',
		[VehicleType.SMALL_VAN]: 'SMALL_VAN',
		[VehicleType.BIG_VAN]: 'BIG_VAN',
		[VehicleType.TRAILER]: 'TRAILER',
		[VehicleType.TRUCK]: 'TRUCK',
		[VehicleType.SINGLE_TRAILER_TRUCK]: 'SINGLE_TRAILER_TRUCK',
		[VehicleType.DOUBLE_TRAILER_TRUCK]: 'DOUBLE_TRAILER_TRUCK'
	};
	
	for (const vehicleType of Object.values(VehicleType).filter((v) => typeof v === 'number') as VehicleType[]) {
		const typeKey = vehicleTypeKeys[vehicleType];
		const metadata = VEHICLE_METADATA[vehicleType];
		const vehicleConfig = config.vehicles[typeKey];
		
		if (!vehicleConfig) {
			throw new Error(`Vehicle config not found for ${typeKey}`);
		}
		
		configs[vehicleType] = {
			name: metadata.name,
			baseCost: vehicleConfig.baseCost,
			capacity: vehicleConfig.capacity,
			maxSpeed: vehicleConfig.maxSpeed,
			minLicenseLevel: metadata.minLicenseLevel,
			vehicleClass: metadata.vehicleClass
		};
	}
	
	return configs;
}

export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = buildVehicleConfigs();

export function getNextVehicle(
	currentVehicle: VehicleType,
	licenseLevel: LicenseType
): VehicleType | null {
	for (
		let vehicleType = currentVehicle + 1;
		vehicleType <= VehicleType.DOUBLE_TRAILER_TRUCK;
		vehicleType++
	) {
		const config = VEHICLE_CONFIGS[vehicleType as VehicleType];
		if (config.minLicenseLevel <= licenseLevel) {
			return vehicleType as VehicleType;
		}
	}
	return null;
}
export function getNextLicense(currentLicense: LicenseType): LicenseType | null {
	const nextLevel = currentLicense + 1;
	return nextLevel <= LicenseType.TOXIC_GOODS ? (nextLevel as LicenseType) : null;
}

// License metadata (not in config - these are structural)
const LICENSE_METADATA: Record<LicenseType, { name: string }> = {
	[LicenseType.UNLICENSED]: { name: 'Unlicensed' },
	[LicenseType.SCOOTER]: { name: 'Scooter' },
	[LicenseType.CAR]: { name: 'Car' },
	[LicenseType.TAXI]: { name: 'Taxi' },
	[LicenseType.FRAGILE_GOODS]: { name: 'Fragile goods' },
	[LicenseType.CONSTRUCTION]: { name: 'Construction' },
	[LicenseType.TRUCKING]: { name: 'Trucking' },
	[LicenseType.LIQUID_GOODS]: { name: 'Liquid goods' },
	[LicenseType.TOXIC_GOODS]: { name: 'Toxic goods' }
};

// Build license configs from YAML config and metadata
function buildLicenseConfigs(): Record<LicenseType, LicenseConfig> {
	const configs = {} as Record<LicenseType, LicenseConfig>;
	
	// Map enum values to their string keys
	const licenseTypeKeys: Record<LicenseType, keyof typeof LicenseType> = {
		[LicenseType.UNLICENSED]: 'UNLICENSED',
		[LicenseType.SCOOTER]: 'SCOOTER',
		[LicenseType.CAR]: 'CAR',
		[LicenseType.TAXI]: 'TAXI',
		[LicenseType.FRAGILE_GOODS]: 'FRAGILE_GOODS',
		[LicenseType.CONSTRUCTION]: 'CONSTRUCTION',
		[LicenseType.TRUCKING]: 'TRUCKING',
		[LicenseType.LIQUID_GOODS]: 'LIQUID_GOODS',
		[LicenseType.TOXIC_GOODS]: 'TOXIC_GOODS'
	};
	
	for (const licenseType of Object.values(LicenseType).filter((v) => typeof v === 'number') as LicenseType[]) {
		const typeKey = licenseTypeKeys[licenseType];
		const metadata = LICENSE_METADATA[licenseType];
		const licenseConfig = config.licenses[typeKey];
		
		if (!licenseConfig) {
			throw new Error(`License config not found for ${typeKey}`);
		}
		
		configs[licenseType] = {
			name: metadata.name,
			minDrivingLevel: licenseConfig.minDrivingLevel,
			cost: licenseConfig.cost
		};
	}
	
	return configs;
}

export const LICENSE_CONFIGS: Record<LicenseType, LicenseConfig> = buildLicenseConfigs();

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
