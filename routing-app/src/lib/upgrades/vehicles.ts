/**
 * Vehicle system configuration
 * Client-safe - uses static configs that can be overridden server-side
 */

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
const VEHICLE_METADATA: Record<
	VehicleType,
	{ name: string; minLicenseLevel: LicenseType; vehicleClass: VehicleClass }
> = {
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

// Build vehicle configs - use static defaults, can be overridden server-side
function buildVehicleConfigs(): Record<VehicleType, VehicleConfig> {
	const configs = {} as Record<VehicleType, VehicleConfig>;

	// Static default values (matching current config.yaml)
	// Server-side code can override these using the config system
	const staticVehicleData: Record<
		keyof typeof VehicleType,
		{ baseCost: number; capacity: number; maxSpeed: number }
	> = {
		BIKE: { baseCost: 0, capacity: 10, maxSpeed: 15 },
		BACKPACK: { baseCost: 10, capacity: 20, maxSpeed: 15 },
		SADDLEBAGS: { baseCost: 15, capacity: 40, maxSpeed: 15 },
		ELECTRIC_BIKE: { baseCost: 30, capacity: 40, maxSpeed: 25 },
		SCOOTER: { baseCost: 100, capacity: 50, maxSpeed: 45 },
		MICRO_CAR: { baseCost: 200, capacity: 100, maxSpeed: 100 },
		SEDAN: { baseCost: 300, capacity: 200, maxSpeed: 130 },
		HATCHBACK: { baseCost: 400, capacity: 300, maxSpeed: 130 },
		SMALL_VAN: { baseCost: 500, capacity: 500, maxSpeed: 120 },
		BIG_VAN: { baseCost: 750, capacity: 1000, maxSpeed: 120 },
		TRAILER: { baseCost: 1000, capacity: 2000, maxSpeed: 100 },
		TRUCK: { baseCost: 3000, capacity: 5000, maxSpeed: 100 },
		SINGLE_TRAILER_TRUCK: { baseCost: 10000, capacity: 10000, maxSpeed: 90 },
		DOUBLE_TRAILER_TRUCK: { baseCost: 20000, capacity: 15000, maxSpeed: 90 }
	};

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

	for (const vehicleType of Object.values(VehicleType).filter(
		(v) => typeof v === 'number'
	) as VehicleType[]) {
		const typeKey = vehicleTypeKeys[vehicleType];
		const metadata = VEHICLE_METADATA[vehicleType];
		const staticData = staticVehicleData[typeKey];

		configs[vehicleType] = {
			name: metadata.name,
			baseCost: staticData.baseCost,
			capacity: staticData.capacity,
			maxSpeed: staticData.maxSpeed,
			minLicenseLevel: metadata.minLicenseLevel,
			vehicleClass: metadata.vehicleClass
		};
	}

	return configs;
}

const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = buildVehicleConfigs();

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

// Build license configs - use static defaults, can be overridden server-side
function buildLicenseConfigs(): Record<LicenseType, LicenseConfig> {
	const configs = {} as Record<LicenseType, LicenseConfig>;

	// Static default values (matching current config.yaml)
	const staticLicenseData: Record<
		keyof typeof LicenseType,
		{ minDrivingLevel: number; cost: number }
	> = {
		UNLICENSED: { minDrivingLevel: 0, cost: 0 },
		SCOOTER: { minDrivingLevel: 1, cost: 50 },
		CAR: { minDrivingLevel: 2, cost: 100 },
		TAXI: { minDrivingLevel: 3, cost: 500 },
		FRAGILE_GOODS: { minDrivingLevel: 4, cost: 500 },
		CONSTRUCTION: { minDrivingLevel: 5, cost: 500 },
		TRUCKING: { minDrivingLevel: 6, cost: 1000 },
		LIQUID_GOODS: { minDrivingLevel: 7, cost: 2000 },
		TOXIC_GOODS: { minDrivingLevel: 8, cost: 3000 }
	};

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

	for (const licenseType of Object.values(LicenseType).filter(
		(v) => typeof v === 'number'
	) as LicenseType[]) {
		const typeKey = licenseTypeKeys[licenseType];
		const metadata = LICENSE_METADATA[licenseType];
		const staticData = staticLicenseData[typeKey];

		configs[licenseType] = {
			name: metadata.name,
			minDrivingLevel: staticData.minDrivingLevel,
			cost: staticData.cost
		};
	}

	return configs;
}

const LICENSE_CONFIGS: Record<LicenseType, LicenseConfig> = buildLicenseConfigs();

/**
 * Get vehicle configuration by type
 */
export function getVehicleConfig(vehicleType: VehicleType): VehicleConfig {
	return VEHICLE_CONFIGS[vehicleType];
}
