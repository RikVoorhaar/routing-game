import type { Employee, Job, Coordinate } from '$lib/server/db/schema';
import { JobCategory } from '$lib/jobs/jobCategories';
import { getVehicleTierByLevel } from '$lib/vehicleUtils';
import { VEHICLE_DEFINITIONS } from '$lib/vehicles/vehicleDefinitions';

/**
 * Get vehicle tier for an employee
 * Uses the vehicle definitions which have a tier field
 */
function getEmployeeVehicleTier(employee: Employee): number {
	return getVehicleTierByLevel(employee.vehicleLevel, VEHICLE_DEFINITIONS);
}

/**
 * Check if an employee can perform a specific job
 * This checks vehicle tier vs job tier (new upgrade system)
 */
export function employeeCanPerformJob(employee: Employee, job: Job): boolean {
	// Ensure job category is a valid JobCategory enum value
	// Convert to number if it's a string, then cast to JobCategory
	const jobCategoryValue =
		typeof job.jobCategory === 'string' ? parseInt(job.jobCategory, 10) : job.jobCategory;

	// Validate that the job category is within valid range
	if (
		isNaN(jobCategoryValue) ||
		jobCategoryValue < 0 ||
		jobCategoryValue > JobCategory.TOXIC_GOODS
	) {
		console.warn('Invalid job category:', job.jobCategory, 'parsed as:', jobCategoryValue);
		return false;
	}

	// Check if employee's vehicle tier is sufficient for the job tier
	// Employee can do a job if their vehicle tier >= job tier
	const employeeVehicleTier = getEmployeeVehicleTier(employee);
	return employeeVehicleTier >= job.jobTier;
}

/**
 * Calculate geodesic distance between two points (rough approximation)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/**
 * Get employee position from location data (Coordinate)
 */
function getEmployeePosition(employee: Employee): { lat: number; lon: number } | null {
	if (!employee.location) return null;

	try {
		let locationData: Coordinate;
		if (typeof employee.location === 'string') {
			locationData = JSON.parse(employee.location);
		} else {
			locationData = employee.location as Coordinate;
		}

		return {
			lat: locationData.lat || 0,
			lon: locationData.lon || 0
		};
	} catch {
		return null;
	}
}

/**
 * Sort employees by distance from a job location
 */
export function sortEmployeesByDistanceFromJob(employees: Employee[], job: Job): Employee[] {
	// Parse job location from PostGIS POINT format
	let jobLat: number, jobLon: number;

	try {
		// job.location is a PostGIS POINT in EWKT format like "POINT(lon lat)"
		const pointMatch = job.location.match(/POINT\(([^\s]+)\s+([^)]+)\)/);
		if (pointMatch) {
			jobLon = parseFloat(pointMatch[1]);
			jobLat = parseFloat(pointMatch[2]);
		} else {
			console.warn('Could not parse job location:', job.location);
			return employees; // Return unsorted if we can't parse location
		}
	} catch (e) {
		console.warn('Error parsing job location:', e);
		return employees;
	}

	return employees
		.map((employee) => {
			const empPos = getEmployeePosition(employee);
			const distance = empPos
				? calculateDistance(empPos.lat, empPos.lon, jobLat, jobLon)
				: Infinity;

			return { employee, distance };
		})
		.sort((a, b) => a.distance - b.distance)
		.map((item) => item.employee);
}
