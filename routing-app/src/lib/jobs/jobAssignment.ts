import type { Employee, Job } from '$lib/server/db/schema';
import { JobCategory } from '$lib/jobs/jobCategories';
import { canEmployeeDoJobCategory, getEmployeeMaxSpeed } from '$lib/employeeUtils';

/**
 * Check if an employee can perform a specific job
 * This checks license level, vehicle class, and driving level vs job tier
 */
export function employeeCanPerformJob(employee: Employee, job: Job): boolean {
	// Ensure job category is a valid JobCategory enum value
	// Convert to number if it's a string, then cast to JobCategory
	const jobCategoryValue =
		typeof job.jobCategory === 'string' ? parseInt(job.jobCategory, 10) : job.jobCategory;
	const jobCategory = jobCategoryValue as JobCategory;

	// Validate that the job category is within valid range
	if (
		isNaN(jobCategoryValue) ||
		jobCategoryValue < 0 ||
		jobCategoryValue > JobCategory.TOXIC_GOODS
	) {
		console.warn('Invalid job category:', job.jobCategory, 'parsed as:', jobCategoryValue);
		return false;
	}

	// Check if employee can do the job category (license + vehicle requirements)
	if (!canEmployeeDoJobCategory(employee, jobCategory)) {
		return false;
	}

	// Check if employee's driving level is sufficient for the job tier
	const drivingLevel =
		typeof employee.drivingLevel === 'string'
			? JSON.parse(employee.drivingLevel)
			: employee.drivingLevel;

	// Minimum driving level required is job tier - 1 (so tier 1 jobs need level 0)
	const requiredDrivingLevel = Math.max(0, job.jobTier - 1);

	return drivingLevel.level >= requiredDrivingLevel;
}

/**
 * Modify route data based on employee's upgrades and max speed
 * For now this only applies max speed, but in the future will apply other modifiers
 */
export function modifyRoute(routeData: any, employee: Employee): any {
	// Get employee's max speed including upgrades
	const maxSpeedKmh = getEmployeeMaxSpeed(employee);

	// Apply speed modifications to the route data
	const modifiedRouteData = {
		...routeData,
		// Store the original travel time for reference
		originalTravelTimeSeconds: routeData.travelTimeSeconds,
		// Apply max speed limit - this would need to be calculated based on the route
		// For now, we'll use a simple approximation
		maxSpeedApplied: maxSpeedKmh
	};

	// If the route has segment data, we could apply speed limits per segment
	// For now, we'll apply a global speed modifier based on the employee's max speed
	if (routeData.travelTimeSeconds) {
		// This is a simplified calculation - in a real implementation,
		// you'd need to recalculate based on actual route segments and speed limits
		const speedRatio = Math.min(1.0, maxSpeedKmh / 130); // Assume 130 km/h as baseline
		modifiedRouteData.travelTimeSeconds = routeData.travelTimeSeconds / speedRatio;
	}

	return modifiedRouteData;
}

/**
 * Calculate geodesic distance between two points (rough approximation)
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
 * Get employee position from location data
 */
export function getEmployeePosition(employee: Employee): { lat: number; lon: number } | null {
	if (!employee.location) return null;

	try {
		let locationData;
		if (typeof employee.location === 'string') {
			locationData = JSON.parse(employee.location);
		} else {
			locationData = employee.location;
		}

		return {
			lat: locationData.lat || 0,
			lon: locationData.lon || 0
		};
	} catch (e) {
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
		const pointMatch = job.location.match(/POINT\(([^\s]+)\s+([^\)]+)\)/);
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
