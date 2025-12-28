import type { UpgradeConfig } from '$lib/config/types';
import { VEHICLE_DEFINITIONS } from '$lib/vehicles/vehicleDefinitions';

/**
 * Generate vehicle unlock upgrades dynamically from vehicle definitions
 */
function generateVehicleUnlockUpgrades(): UpgradeConfig[] {
	const upgrades: UpgradeConfig[] = [];

	for (let i = 0; i < VEHICLE_DEFINITIONS.length; i++) {
		const vehicle = VEHICLE_DEFINITIONS[i];
		const upgradeId = `unlock_${vehicle.id}`;

		// Determine dependencies: depends on previous vehicle's unlock upgrade
		const upgradeRequirements: string[] = [];
		if (i > 0) {
			const previousVehicle = VEHICLE_DEFINITIONS[i - 1];
			const previousUpgradeId = `unlock_${previousVehicle.id}`;
			upgradeRequirements.push(previousUpgradeId);
		}

		upgrades.push({
			id: upgradeId,
			name: vehicle.name,
			upgradeRequirements,
			levelRequirements: {
				total: vehicle.unlockLevelRequirement
			},
			description: `Unlocks ${vehicle.name.toLowerCase()} for all employees`,
			cost: vehicle.unlockCost,
			effect: 'set',
			effectArguments: {
				name: 'vehicleLevelMax',
				amount: vehicle.level
			}
		});
	}

	return upgrades;
}

/**
 * Global upgrade definitions
 * These define the tech tree structure for global upgrades that affect the entire game
 */
export const UPGRADE_DEFINITIONS: UpgradeConfig[] = [
	// ============================================================================
	// Vehicle Unlock Upgrades (generated dynamically from vehicle definitions)
	// Each unlocks a vehicle level by setting vehicleLevelMax to the vehicle level
	// ============================================================================
	...generateVehicleUnlockUpgrades(),

	// ============================================================================
	// Category Unlock Upgrades (5 upgrades)
	// These unlock job categories (People, Fragile, Construction, Liquids, Toxic)
	// Note: Category unlocking may need to be wired in step 16
	// ============================================================================
	{
		id: 'taxi_license',
		name: 'Taxi License',
		upgradeRequirements: [],
		levelRequirements: {
			total: 20
		},
		description: 'Unlocks People job category',
		cost: 500,
		effect: 'increment',
		effectArguments: {
			name: 'categoryUnlock',
			amount: 1
		}
	},
	{
		id: 'certified_courier',
		name: 'Certified Courier',
		upgradeRequirements: [],
		levelRequirements: {
			total: 35
		},
		description: 'Unlocks Fragile Goods job category',
		cost: 1000,
		effect: 'increment',
		effectArguments: {
			name: 'categoryUnlock',
			amount: 1
		}
	},
	{
		id: 'tough_guy',
		name: 'Tough Guy',
		upgradeRequirements: [],
		levelRequirements: {
			total: 50
		},
		description: 'Unlocks Construction job category',
		cost: 4000,
		effect: 'increment',
		effectArguments: {
			name: 'categoryUnlock',
			amount: 1
		}
	},
	{
		id: 'slightly_tipsy',
		name: 'Slightly Tipsy',
		upgradeRequirements: [],
		levelRequirements: {
			total: 70
		},
		description: 'Unlocks Liquids job category',
		cost: 2000,
		effect: 'increment',
		effectArguments: {
			name: 'categoryUnlock',
			amount: 1
		}
	},
	{
		id: 'hazmat_suit',
		name: 'Put on your hazmat suit',
		upgradeRequirements: [],
		levelRequirements: {
			total: 90
		},
		description: 'Unlocks Toxic Goods job category',
		cost: 8000,
		effect: 'increment',
		effectArguments: {
			name: 'categoryUnlock',
			amount: 1
		}
	},

	// ============================================================================
	// Speed Upgrades (5 upgrades)
	// ============================================================================
	{
		id: 'speed_1',
		name: 'Better Routes I',
		upgradeRequirements: [],
		levelRequirements: {
			total: 6
		},
		description: 'Increase speed of all jobs by 30%',
		cost: 120,
		effect: 'multiply',
		effectArguments: {
			name: 'speed',
			amount: 1.3
		}
	},
	{
		id: 'speed_2',
		name: 'Better Routes II',
		upgradeRequirements: ['speed_1'],
		levelRequirements: {
			total: 22
		},
		description: 'Increase speed of all jobs by 30%',
		cost: 480,
		effect: 'multiply',
		effectArguments: {
			name: 'speed',
			amount: 1.3
		}
	},
	{
		id: 'speed_3',
		name: 'Better Routes III',
		upgradeRequirements: ['speed_2'],
		levelRequirements: {
			total: 55
		},
		description: 'Increase speed of all jobs by 25%',
		cost: 2500,
		effect: 'multiply',
		effectArguments: {
			name: 'speed',
			amount: 1.25
		}
	},
	{
		id: 'speed_4',
		name: 'Better Routes IV',
		upgradeRequirements: ['speed_3'],
		levelRequirements: {
			total: 80
		},
		description: 'Increase speed of all jobs by 30%',
		cost: 12000,
		effect: 'multiply',
		effectArguments: {
			name: 'speed',
			amount: 1.3
		}
	},
	{
		id: 'speed_5',
		name: 'Better Routes V',
		upgradeRequirements: ['speed_4'],
		levelRequirements: {
			total: 99
		},
		description: 'Increase speed of all jobs by 25%',
		cost: 60000,
		effect: 'multiply',
		effectArguments: {
			name: 'speed',
			amount: 1.25
		}
	},

	// ============================================================================
	// Capacity Upgrades (5 upgrades)
	// ============================================================================
	{
		id: 'capacity_1',
		name: 'Packing I',
		upgradeRequirements: [],
		levelRequirements: {
			FURNITURE: 8
		},
		description: 'Increase capacity of all vehicles by 25%',
		cost: 140,
		effect: 'multiply',
		effectArguments: {
			name: 'capacity',
			amount: 1.25
		}
	},
	{
		id: 'capacity_2',
		name: 'Packing II',
		upgradeRequirements: ['capacity_1'],
		levelRequirements: {
			FURNITURE: 20,
			total: 25
		},
		description: 'Increase capacity of all vehicles by 25%',
		cost: 520,
		effect: 'multiply',
		effectArguments: {
			name: 'capacity',
			amount: 1.25
		}
	},
	{
		id: 'capacity_3',
		name: 'Packing III',
		upgradeRequirements: ['capacity_2'],
		levelRequirements: {
			FURNITURE: 35,
			total: 40
		},
		description: 'Increase capacity of all vehicles by 20%',
		cost: 1900,
		effect: 'multiply',
		effectArguments: {
			name: 'capacity',
			amount: 1.2
		}
	},
	{
		id: 'capacity_4',
		name: 'Packing IV',
		upgradeRequirements: ['capacity_3'],
		levelRequirements: {
			FURNITURE: 70,
			total: 75
		},
		description: 'Increase capacity of all vehicles by 25%',
		cost: 10000,
		effect: 'multiply',
		effectArguments: {
			name: 'capacity',
			amount: 1.25
		}
	},
	{
		id: 'capacity_5',
		name: 'Packing V',
		upgradeRequirements: ['capacity_4'],
		levelRequirements: {
			FURNITURE: 99,
			total: 99
		},
		description: 'Increase capacity of all vehicles by 20%',
		cost: 55000,
		effect: 'multiply',
		effectArguments: {
			name: 'capacity',
			amount: 1.2
		}
	},

	// ============================================================================
	// XP Multiplier Upgrades (5 upgrades)
	// ============================================================================
	{
		id: 'xp_1',
		name: 'Training I',
		upgradeRequirements: [],
		levelRequirements: {
			PEOPLE: 8
		},
		description: 'Increase XP gain from all jobs by 35%',
		cost: 160,
		effect: 'multiply',
		effectArguments: {
			name: 'xpMultiplier',
			amount: 1.35
		}
	},
	{
		id: 'xp_2',
		name: 'Training II',
		upgradeRequirements: ['xp_1'],
		levelRequirements: {
			PEOPLE: 22,
			total: 28
		},
		description: 'Increase XP gain from all jobs by 35%',
		cost: 650,
		effect: 'multiply',
		effectArguments: {
			name: 'xpMultiplier',
			amount: 1.35
		}
	},
	{
		id: 'xp_3',
		name: 'Training III',
		upgradeRequirements: ['xp_2'],
		levelRequirements: {
			PEOPLE: 45,
			total: 55
		},
		description: 'Increase XP gain from all jobs by 30%',
		cost: 2900,
		effect: 'multiply',
		effectArguments: {
			name: 'xpMultiplier',
			amount: 1.3
		}
	},
	{
		id: 'xp_4',
		name: 'Training IV',
		upgradeRequirements: ['xp_3'],
		levelRequirements: {
			PEOPLE: 75,
			total: 80
		},
		description: 'Increase XP gain from all jobs by 35%',
		cost: 15000,
		effect: 'multiply',
		effectArguments: {
			name: 'xpMultiplier',
			amount: 1.35
		}
	},
	{
		id: 'xp_5',
		name: 'Training V',
		upgradeRequirements: ['xp_4'],
		levelRequirements: {
			PEOPLE: 99,
			total: 99
		},
		description: 'Increase XP gain from all jobs by 30%',
		cost: 80000,
		effect: 'multiply',
		effectArguments: {
			name: 'xpMultiplier',
			amount: 1.3
		}
	},

	// ============================================================================
	// Money Distance Factor Upgrades (5 upgrades)
	// ============================================================================
	{
		id: 'money_dist_1',
		name: 'Distance Pay I',
		upgradeRequirements: [],
		levelRequirements: {
			GROCERIES: 8
		},
		description: 'Increase money earned from distance by 30%',
		cost: 130,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyDistanceFactor',
			amount: 1.3
		}
	},
	{
		id: 'money_dist_2',
		name: 'Distance Pay II',
		upgradeRequirements: ['money_dist_1'],
		levelRequirements: {
			GROCERIES: 22,
			total: 28
		},
		description: 'Increase money earned from distance by 30%',
		cost: 520,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyDistanceFactor',
			amount: 1.3
		}
	},
	{
		id: 'money_dist_3',
		name: 'Distance Pay III',
		upgradeRequirements: ['money_dist_2'],
		levelRequirements: {
			GROCERIES: 45,
			total: 55
		},
		description: 'Increase money earned from distance by 25%',
		cost: 2400,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyDistanceFactor',
			amount: 1.25
		}
	},
	{
		id: 'money_dist_4',
		name: 'Distance Pay IV',
		upgradeRequirements: ['money_dist_3'],
		levelRequirements: {
			GROCERIES: 75,
			total: 80
		},
		description: 'Increase money earned from distance by 30%',
		cost: 12000,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyDistanceFactor',
			amount: 1.3
		}
	},
	{
		id: 'money_dist_5',
		name: 'Distance Pay V',
		upgradeRequirements: ['money_dist_4'],
		levelRequirements: {
			GROCERIES: 99,
			total: 99
		},
		description: 'Increase money earned from distance by 25%',
		cost: 65000,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyDistanceFactor',
			amount: 1.25
		}
	},

	// ============================================================================
	// Money Time Factor Upgrades (5 upgrades)
	// ============================================================================
	{
		id: 'money_time_1',
		name: 'Time Pay I',
		upgradeRequirements: [],
		levelRequirements: {
			FOOD: 8
		},
		description: 'Increase money earned from time by 30%',
		cost: 130,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyTimeFactor',
			amount: 1.3
		}
	},
	{
		id: 'money_time_2',
		name: 'Time Pay II',
		upgradeRequirements: ['money_time_1'],
		levelRequirements: {
			FOOD: 22,
			total: 28
		},
		description: 'Increase money earned from time by 30%',
		cost: 520,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyTimeFactor',
			amount: 1.3
		}
	},
	{
		id: 'money_time_3',
		name: 'Time Pay III',
		upgradeRequirements: ['money_time_2'],
		levelRequirements: {
			FOOD: 45,
			total: 55
		},
		description: 'Increase money earned from time by 25%',
		cost: 2400,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyTimeFactor',
			amount: 1.25
		}
	},
	{
		id: 'money_time_4',
		name: 'Time Pay IV',
		upgradeRequirements: ['money_time_3'],
		levelRequirements: {
			FOOD: 75,
			total: 80
		},
		description: 'Increase money earned from time by 30%',
		cost: 12000,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyTimeFactor',
			amount: 1.3
		}
	},
	{
		id: 'money_time_5',
		name: 'Time Pay V',
		upgradeRequirements: ['money_time_4'],
		levelRequirements: {
			FOOD: 99,
			total: 99
		},
		description: 'Increase money earned from time by 25%',
		cost: 65000,
		effect: 'multiply',
		effectArguments: {
			name: 'moneyTimeFactor',
			amount: 1.25
		}
	},

	// ============================================================================
	// Discount Upgrades (5 upgrades)
	// ============================================================================
	{
		id: 'discount_1',
		name: 'Bulk Deals I',
		upgradeRequirements: [],
		levelRequirements: {
			PACKAGES: 10,
			total: 12
		},
		description: 'Reduce cost of all upgrades by 10%',
		cost: 220,
		effect: 'multiply',
		effectArguments: {
			name: 'upgradeDiscount',
			amount: 0.9
		}
	},
	{
		id: 'discount_2',
		name: 'Bulk Deals II',
		upgradeRequirements: ['discount_1'],
		levelRequirements: {
			PACKAGES: 25,
			total: 30
		},
		description: 'Reduce cost of all upgrades by 10%',
		cost: 900,
		effect: 'multiply',
		effectArguments: {
			name: 'upgradeDiscount',
			amount: 0.9
		}
	},
	{
		id: 'discount_3',
		name: 'Bulk Deals III',
		upgradeRequirements: ['discount_2'],
		levelRequirements: {
			PACKAGES: 55,
			total: 60
		},
		description: 'Reduce cost of all upgrades by 10%',
		cost: 4500,
		effect: 'multiply',
		effectArguments: {
			name: 'upgradeDiscount',
			amount: 0.9
		}
	},
	{
		id: 'discount_4',
		name: 'Bulk Deals IV',
		upgradeRequirements: ['discount_3'],
		levelRequirements: {
			PACKAGES: 80,
			total: 85
		},
		description: 'Reduce cost of all upgrades by 10%',
		cost: 25000,
		effect: 'multiply',
		effectArguments: {
			name: 'upgradeDiscount',
			amount: 0.9
		}
	},
	{
		id: 'discount_5',
		name: 'Bulk Deals V',
		upgradeRequirements: ['discount_4'],
		levelRequirements: {
			PACKAGES: 99,
			total: 99
		},
		description: 'Reduce cost of all upgrades by 10%',
		cost: 150000,
		effect: 'multiply',
		effectArguments: {
			name: 'upgradeDiscount',
			amount: 0.9
		}
	},

	// ============================================================================
	// Deferred Upgrades (effects not wired yet - will be implemented in step 16)
	// ============================================================================

	// Employee Level Start Upgrades (4 upgrades) - NOT WIRED
	{
		id: 'start_lvl_1',
		name: 'Better Hires I',
		upgradeRequirements: [],
		levelRequirements: {
			total: 18
		},
		description: 'Increase starting level for new employees by 10 (not wired yet)',
		cost: 600,
		effect: 'increment',
		effectArguments: {
			name: 'employeeLevelStart',
			amount: 10
		}
	},
	{
		id: 'start_lvl_2',
		name: 'Better Hires II',
		upgradeRequirements: ['start_lvl_1'],
		levelRequirements: {
			total: 40
		},
		description: 'Increase starting level for new employees by 20 (not wired yet)',
		cost: 2500,
		effect: 'increment',
		effectArguments: {
			name: 'employeeLevelStart',
			amount: 20
		}
	},
	{
		id: 'start_lvl_3',
		name: 'Better Hires III',
		upgradeRequirements: ['start_lvl_2'],
		levelRequirements: {
			total: 75
		},
		description: 'Increase starting level for new employees by 40 (not wired yet)',
		cost: 12000,
		effect: 'increment',
		effectArguments: {
			name: 'employeeLevelStart',
			amount: 40
		}
	},
	{
		id: 'start_lvl_4',
		name: 'Better Hires IV',
		upgradeRequirements: ['start_lvl_3'],
		levelRequirements: {
			total: 99
		},
		description: 'Increase starting level for new employees by 60 (not wired yet)',
		cost: 80000,
		effect: 'increment',
		effectArguments: {
			name: 'employeeLevelStart',
			amount: 60
		}
	},

	// Vehicle Level Start Upgrades (4 upgrades) - NOT WIRED
	{
		id: 'start_veh_1',
		name: 'Better Gear I',
		upgradeRequirements: ['unlock_scooter'],
		levelRequirements: {
			total: 22
		},
		description: 'Increase starting vehicle level for new employees by 1 (not wired yet)',
		cost: 650,
		effect: 'increment',
		effectArguments: {
			name: 'vehicleLevelMin',
			amount: 1
		}
	},
	{
		id: 'start_veh_2',
		name: 'Better Gear II',
		upgradeRequirements: ['start_veh_1'],
		levelRequirements: {
			total: 50
		},
		description: 'Increase starting vehicle level for new employees by 2 (not wired yet)',
		cost: 3200,
		effect: 'increment',
		effectArguments: {
			name: 'vehicleLevelMin',
			amount: 2
		}
	},
	{
		id: 'start_veh_3',
		name: 'Better Gear III',
		upgradeRequirements: ['start_veh_2'],
		levelRequirements: {
			total: 75
		},
		description: 'Increase starting vehicle level for new employees by 3 (not wired yet)',
		cost: 12000,
		effect: 'increment',
		effectArguments: {
			name: 'vehicleLevelMin',
			amount: 3
		}
	},
	{
		id: 'start_veh_4',
		name: 'Better Gear IV',
		upgradeRequirements: ['start_veh_3'],
		levelRequirements: {
			total: 99
		},
		description: 'Increase starting vehicle level for new employees by 4 (not wired yet)',
		cost: 80000,
		effect: 'increment',
		effectArguments: {
			name: 'vehicleLevelMin',
			amount: 4
		}
	},

	// More Jobs Per Tier Upgrades (3 upgrades) - NOT WIRED
	{
		id: 'more_jobs_1',
		name: 'More Jobs I',
		upgradeRequirements: [],
		levelRequirements: {
			total: 25
		},
		description: 'Increase number of jobs per tier by 1 (not wired yet)',
		cost: 600,
		effect: 'increment',
		effectArguments: {
			name: 'jobsPerTier',
			amount: 1
		}
	},
	{
		id: 'more_jobs_2',
		name: 'More Jobs II',
		upgradeRequirements: ['more_jobs_1'],
		levelRequirements: {
			total: 55
		},
		description: 'Increase number of jobs per tier by 1 (not wired yet)',
		cost: 3000,
		effect: 'increment',
		effectArguments: {
			name: 'jobsPerTier',
			amount: 1
		}
	},
	{
		id: 'more_jobs_3',
		name: 'More Jobs III',
		upgradeRequirements: ['more_jobs_2'],
		levelRequirements: {
			total: 85
		},
		description: 'Increase number of jobs per tier by 1 (not wired yet)',
		cost: 18000,
		effect: 'increment',
		effectArguments: {
			name: 'jobsPerTier',
			amount: 1
		}
	},

	// Fast Travel Upgrades (3 upgrades) - NOT WIRED
	{
		id: 'fast_travel_1',
		name: 'Fast Travel I',
		upgradeRequirements: [],
		levelRequirements: {
			total: 30
		},
		description: 'Reduce free travel time by 10% (not wired yet)',
		cost: 900,
		effect: 'multiply',
		effectArguments: {
			name: 'freeTravel',
			amount: 0.9
		}
	},
	{
		id: 'fast_travel_2',
		name: 'Fast Travel II',
		upgradeRequirements: ['fast_travel_1'],
		levelRequirements: {
			total: 60
		},
		description: 'Reduce free travel time by 15% (not wired yet)',
		cost: 5000,
		effect: 'multiply',
		effectArguments: {
			name: 'freeTravel',
			amount: 0.85
		}
	},
	{
		id: 'fast_travel_3',
		name: 'Fast Travel III',
		upgradeRequirements: ['fast_travel_2'],
		levelRequirements: {
			total: 90
		},
		description: 'Reduce free travel time by 25% (not wired yet)',
		cost: 35000,
		effect: 'multiply',
		effectArguments: {
			name: 'freeTravel',
			amount: 0.75
		}
	},

	// Roadspeed Cap Upgrade (1 upgrade) - NOT WIRED
	{
		id: 'roadspeed_cap',
		name: 'Speed Cap',
		upgradeRequirements: ['unlock_compact_car', 'speed_5'],
		levelRequirements: {
			total: 99
		},
		description: 'Set minimum road speed to 120 km/h for all vehicles (not wired yet)',
		cost: 150000,
		effect: 'increment',
		effectArguments: {
			name: 'roadSpeedMin',
			amount: 120
		}
	}
];
