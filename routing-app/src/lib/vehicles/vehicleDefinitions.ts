import type { VehicleConfig } from '$lib/config/types';

/**
 * Vehicle definitions
 * These define the available vehicles by level, with their stats (capacity, speed, tier)
 * Capacity is in kg, roadSpeed is in km/h, tier determines job eligibility
 * Cost is the per-employee upgrade cost in euros (unlock cost is separate, defined in upgrades)
 */
export const VEHICLE_DEFINITIONS: VehicleConfig[] = [
	{
		level: 0,
		name: 'Bike',
		capacity: 10,
		roadSpeed: 15,
		tier: 1,
		cost: 0 // Starting vehicle, no cost
	},
	{
		level: 1,
		name: 'Pannier Bike',
		capacity: 25,
		roadSpeed: 18,
		tier: 1,
		cost: 12
	},
	{
		level: 2,
		name: 'E-Bike',
		capacity: 20,
		roadSpeed: 25,
		tier: 2,
		cost: 28
	},
	{
		level: 3,
		name: 'Cargo Bike',
		capacity: 80,
		roadSpeed: 20,
		tier: 2,
		cost: 60
	},
	{
		level: 4,
		name: 'Scooter',
		capacity: 50,
		roadSpeed: 45,
		tier: 3,
		cost: 130
	},
	{
		level: 5,
		name: 'Motorbike 125',
		capacity: 80,
		roadSpeed: 70,
		tier: 3,
		cost: 260
	},
	{
		level: 6,
		name: 'Compact Car',
		capacity: 250,
		roadSpeed: 120,
		tier: 4,
		cost: 520
	},
	{
		level: 7,
		name: 'Small Van',
		capacity: 700,
		roadSpeed: 110,
		tier: 4,
		cost: 1050
	},
	{
		level: 8,
		name: 'Cargo Van',
		capacity: 1200,
		roadSpeed: 105,
		tier: 5,
		cost: 2100
	},
	{
		level: 9,
		name: 'Box Truck',
		capacity: 3500,
		roadSpeed: 90,
		tier: 6,
		cost: 4200
	},
	{
		level: 10,
		name: 'Tipper Truck',
		capacity: 5000,
		roadSpeed: 85,
		tier: 6,
		cost: 8500
	},
	{
		level: 11,
		name: 'Tanker',
		capacity: 8000,
		roadSpeed: 80,
		tier: 7,
		cost: 17000
	},
	{
		level: 12,
		name: 'Hazmat Truck',
		capacity: 12000,
		roadSpeed: 80,
		tier: 8,
		cost: 34000
	},
	{
		level: 13,
		name: 'Hazmat Semi',
		capacity: 18000,
		roadSpeed: 75,
		tier: 8,
		cost: 70000
	}
];
