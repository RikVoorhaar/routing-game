import type { VehicleConfig } from '$lib/config/types';

/**
 * Vehicle definitions
 * These define the available vehicles by level, with their stats (capacity, speed, tier)
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
		name: 'Cargo Bike',
		capacity: 40,
		roadSpeed: 20,
		tier: 2,
		cost: 5
	},
	{
		level: 2,
		name: 'Electric Bike',
		capacity: 40,
		roadSpeed: 25,
		tier: 2,
		cost: 10
	},
	{
		level: 3,
		name: 'Scooter',
		capacity: 50,
		roadSpeed: 45,
		tier: 3,
		cost: 20
	}
];
