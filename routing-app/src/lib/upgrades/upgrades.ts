/**
 * Employee upgrade system configuration
 */

import { JobCategory } from '../jobs/jobCategories';
import { LicenseType, VehicleClass } from './vehicles';

export interface UpgradeInfo {
	name: string;
	effectDescription: string;
}

export interface CategoryLevel {
	level: number;
	xp: number;
}

export interface DrivingLevel {
	level: number;
	xp: number;
}

export interface CategoryUpgrades {
	[JobCategory.GROCERIES]: number;
	[JobCategory.PACKAGES]: number;
	[JobCategory.FOOD]: number;
	[JobCategory.FURNITURE]: number;
	[JobCategory.PEOPLE]: number;
	[JobCategory.FRAGILE_GOODS]: number;
	[JobCategory.CONSTRUCTION]: number;
	[JobCategory.LIQUIDS]: number;
	[JobCategory.TOXIC_GOODS]: number;
}

export interface JobCategoryRestriction {
	minLicense: LicenseType;
	minVehicleClass: VehicleClass;
}

/**
 * Upgrade information for each job category
 */
export const CATEGORY_UPGRADES: Record<JobCategory, UpgradeInfo> = {
	[JobCategory.GROCERIES]: {
		name: 'Haggling',
		effectDescription: 'Money earned based on distance +5% per level'
	},
	[JobCategory.PACKAGES]: {
		name: 'Quick feet',
		effectDescription: 'Reduces time spent going from node to address by 20% per level'
	},
	[JobCategory.FOOD]: {
		name: 'Unionized',
		effectDescription: 'Money earned based on time +5% per level'
	},
	[JobCategory.FURNITURE]: {
		name: 'Efficient packing',
		effectDescription: 'Increases capacity by 5% per level'
	},
	[JobCategory.PEOPLE]: {
		name: 'Well connected',
		effectDescription: 'XP gain +10% per level'
	},
	[JobCategory.FRAGILE_GOODS]: {
		name: 'Careful driver',
		effectDescription: 'Increase max speed by 5km/h per level (road speed limits still apply)'
	},
	[JobCategory.CONSTRUCTION]: {
		name: 'Strong back',
		effectDescription: 'Increases max available job capacity by 20% per level'
	},
	[JobCategory.LIQUIDS]: {
		name: 'Gassed up',
		effectDescription: 'Time spent on route reduced by 5% per level'
	},
	[JobCategory.TOXIC_GOODS]: {
		name: 'Intimidating',
		effectDescription: 'Upgrade cost reduction 10% per level'
	}
};

/**
 * Job category restrictions for licenses and vehicle classes
 */
export const JOB_CATEGORY_RESTRICTIONS: Record<JobCategory, JobCategoryRestriction> = {
	[JobCategory.GROCERIES]: {
		minLicense: LicenseType.UNLICENSED,
		minVehicleClass: VehicleClass.BIKE
	},
	[JobCategory.PACKAGES]: {
		minLicense: LicenseType.UNLICENSED,
		minVehicleClass: VehicleClass.BIKE
	},
	[JobCategory.FOOD]: {
		minLicense: LicenseType.SCOOTER,
		minVehicleClass: VehicleClass.SCOOTER
	},
	[JobCategory.FURNITURE]: {
		minLicense: LicenseType.CAR,
		minVehicleClass: VehicleClass.CAR
	},
	[JobCategory.PEOPLE]: {
		minLicense: LicenseType.TAXI,
		minVehicleClass: VehicleClass.CAR
	},
	[JobCategory.FRAGILE_GOODS]: {
		minLicense: LicenseType.FRAGILE_GOODS,
		minVehicleClass: VehicleClass.CAR
	},
	[JobCategory.CONSTRUCTION]: {
		minLicense: LicenseType.CONSTRUCTION,
		minVehicleClass: VehicleClass.VAN
	},
	[JobCategory.LIQUIDS]: {
		minLicense: LicenseType.LIQUID_GOODS,
		minVehicleClass: VehicleClass.TRUCK
	},
	[JobCategory.TOXIC_GOODS]: {
		minLicense: LicenseType.TOXIC_GOODS,
		minVehicleClass: VehicleClass.TRUCK
	}
};

/**
 * Compute upgrade cost for a given category and level
 * Formula: baseCost * (costExponent ^ (level - 1))
 * Uses default values (can be overridden server-side)
 */
export function computeUpgradeCost(
	jobCategory: JobCategory,
	level: number,
	baseCost: number = 50,
	costExponent: number = 2
): number {
	if (level <= 0) return baseCost;
	return baseCost * Math.pow(costExponent, level - 1);
}

/**
 * Get default category levels (level 1, 0 xp for all categories)
 */
export function getDefaultCategoryLevels(): Record<JobCategory, CategoryLevel> {
	return {
		[JobCategory.GROCERIES]: { level: 1, xp: 0 },
		[JobCategory.PACKAGES]: { level: 1, xp: 0 },
		[JobCategory.FOOD]: { level: 1, xp: 0 },
		[JobCategory.FURNITURE]: { level: 1, xp: 0 },
		[JobCategory.PEOPLE]: { level: 1, xp: 0 },
		[JobCategory.FRAGILE_GOODS]: { level: 1, xp: 0 },
		[JobCategory.CONSTRUCTION]: { level: 1, xp: 0 },
		[JobCategory.LIQUIDS]: { level: 1, xp: 0 },
		[JobCategory.TOXIC_GOODS]: { level: 1, xp: 0 }
	};
}

/**
 * Get default category upgrades (0 for all categories)
 */
export function getDefaultCategoryUpgrades(): CategoryUpgrades {
	return {
		[JobCategory.GROCERIES]: 0,
		[JobCategory.PACKAGES]: 0,
		[JobCategory.FOOD]: 0,
		[JobCategory.FURNITURE]: 0,
		[JobCategory.PEOPLE]: 0,
		[JobCategory.FRAGILE_GOODS]: 0,
		[JobCategory.CONSTRUCTION]: 0,
		[JobCategory.LIQUIDS]: 0,
		[JobCategory.TOXIC_GOODS]: 0
	};
}

/**
 * Get default driving level
 */
export function getDefaultDrivingLevel(): DrivingLevel {
	return { level: 1, xp: 0 };
}

/**
 * Check if an employee can do jobs of a specific category
 */
export function canDoJobCategory(
	jobCategory: JobCategory,
	licenseLevel: LicenseType,
	vehicleClass: VehicleClass
): boolean {
	const restrictions = JOB_CATEGORY_RESTRICTIONS[jobCategory];

	if (!restrictions) {
		console.error(
			'No restrictions found for job category:',
			jobCategory,
			'type:',
			typeof jobCategory
		);
		return false;
	}

	return (
		licenseLevel >= restrictions.minLicense &&
		vehicleClassMeetsRequirement(vehicleClass, restrictions.minVehicleClass)
	);
}

/**
 * Check if a vehicle class meets the minimum requirement
 */
function vehicleClassMeetsRequirement(actual: VehicleClass, required: VehicleClass): boolean {
	const classHierarchy = [
		VehicleClass.BIKE,
		VehicleClass.SCOOTER,
		VehicleClass.CAR,
		VehicleClass.VAN,
		VehicleClass.TRUCK
	];

	const actualIndex = classHierarchy.indexOf(actual);
	const requiredIndex = classHierarchy.indexOf(required);

	return actualIndex >= requiredIndex;
}

/**
 * Get upgrade info for a category
 */
export function getUpgradeInfo(category: JobCategory): UpgradeInfo {
	return CATEGORY_UPGRADES[category];
}

/**
 * Get job category restrictions
 */
export function getJobCategoryRestrictions(category: JobCategory): JobCategoryRestriction {
	return JOB_CATEGORY_RESTRICTIONS[category];
}
