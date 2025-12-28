import type { VehicleConfig } from '$lib/config/types';

/**
 * Vehicle definitions
 * These define the available vehicles by level, with their stats (capacity, speed, tier)
 * Capacity is in kg, roadSpeed is in km/h, tier determines job eligibility
 * unlockCost is the cost to unlock the vehicle globally (via upgrade)
 * purchaseCost is the cost for an employee to purchase this vehicle level
 */
export const VEHICLE_DEFINITIONS: VehicleConfig[] = [
	{
		id: 'bike',
		level: 0,
		name: 'Bike',
		capacity: 10,
		roadSpeed: 15,
		tier: 1,
		purchaseCost: 0, // Starting vehicle, no cost
		unlockCost: 0,
		unlockLevelRequirement: 0,
		purchaseLevelRequirement: 0
	},
	{
		id: 'pannier_bike',
		level: 1,
		name: 'Pannier Bike',
		capacity: 25,
		roadSpeed: 18,
		tier: 1,
		purchaseCost: 12,
		unlockCost: 20,
		unlockLevelRequirement: 3,
		purchaseLevelRequirement: 2
	},
	{
		id: 'e_bike',
		level: 2,
		name: 'E-Bike',
		capacity: 20,
		roadSpeed: 25,
		tier: 2,
		purchaseCost: 28,
		unlockCost: 60,
		unlockLevelRequirement: 6,
		purchaseLevelRequirement: 4
	},
	{
		id: 'cargo_bike',
		level: 3,
		name: 'Cargo Bike',
		capacity: 80,
		roadSpeed: 20,
		tier: 2,
		purchaseCost: 60,
		unlockCost: 150,
		unlockLevelRequirement: 10,
		purchaseLevelRequirement: 6
	},
	{
		id: 'scooter',
		level: 4,
		name: 'Scooter',
		capacity: 50,
		roadSpeed: 45,
		tier: 3,
		purchaseCost: 130,
		unlockCost: 400,
		unlockLevelRequirement: 15,
		purchaseLevelRequirement: 9
	},
	{
		id: 'motorbike_125',
		level: 5,
		name: 'Motorbike 125',
		capacity: 80,
		roadSpeed: 70,
		tier: 3,
		purchaseCost: 260,
		unlockCost: 900,
		unlockLevelRequirement: 22,
		purchaseLevelRequirement: 13
	},
	{
		id: 'compact_car',
		level: 6,
		name: 'Compact Car',
		capacity: 250,
		roadSpeed: 120,
		tier: 4,
		purchaseCost: 520,
		unlockCost: 2000,
		unlockLevelRequirement: 30,
		purchaseLevelRequirement: 18
	},
	{
		id: 'small_van',
		level: 7,
		name: 'Small Van',
		capacity: 700,
		roadSpeed: 110,
		tier: 4,
		purchaseCost: 1050,
		unlockCost: 4500,
		unlockLevelRequirement: 40,
		purchaseLevelRequirement: 24
	},
	{
		id: 'cargo_van',
		level: 8,
		name: 'Cargo Van',
		capacity: 1200,
		roadSpeed: 105,
		tier: 5,
		purchaseCost: 2100,
		unlockCost: 10000,
		unlockLevelRequirement: 50,
		purchaseLevelRequirement: 30
	},
	{
		id: 'box_truck',
		level: 9,
		name: 'Box Truck',
		capacity: 3500,
		roadSpeed: 90,
		tier: 6,
		purchaseCost: 4200,
		unlockCost: 22000,
		unlockLevelRequirement: 60,
		purchaseLevelRequirement: 36
	},
	{
		id: 'tipper_truck',
		level: 10,
		name: 'Tipper Truck',
		capacity: 5000,
		roadSpeed: 85,
		tier: 6,
		purchaseCost: 8500,
		unlockCost: 48000,
		unlockLevelRequirement: 70,
		purchaseLevelRequirement: 42
	},
	{
		id: 'tanker',
		level: 11,
		name: 'Tanker',
		capacity: 8000,
		roadSpeed: 80,
		tier: 7,
		purchaseCost: 17000,
		unlockCost: 100000,
		unlockLevelRequirement: 80,
		purchaseLevelRequirement: 48
	},
	{
		id: 'hazmat_truck',
		level: 12,
		name: 'Hazmat Truck',
		capacity: 12000,
		roadSpeed: 80,
		tier: 8,
		purchaseCost: 34000,
		unlockCost: 210000,
		unlockLevelRequirement: 90,
		purchaseLevelRequirement: 55
	},
	{
		id: 'hazmat_semi',
		level: 13,
		name: 'Hazmat Semi',
		capacity: 18000,
		roadSpeed: 75,
		tier: 8,
		purchaseCost: 70000,
		unlockCost: 450000,
		unlockLevelRequirement: 99,
		purchaseLevelRequirement: 60
	}
];
