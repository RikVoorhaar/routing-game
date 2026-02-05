<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { GeoJSONSource, CircleLayer } from 'svelte-maplibre-gl';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { displayedRoutes } from '$lib/stores/mapDisplay';
	import { interpolateLocationAtTime } from '$lib/routes/routing-client';
	import { log } from '$lib/logger';
	import type { Employee, PathPoint, Coordinate } from '$lib/server/db/schema';
	import type { FeatureCollection, Feature, Point } from 'geojson';

	// Animation configuration
	const ANIMATION_FPS = 30;
	const ANIMATION_INTERVAL_MS = 1000 / ANIMATION_FPS;

	// Employee positions as GeoJSON FeatureCollection
	let employeeGeoJson: FeatureCollection<Point> = {
		type: 'FeatureCollection',
		features: []
	};

	// Animation timestamp to trigger position updates
	let animationTimestamp = 0;
	let animationInterval: NodeJS.Timeout | null = null;

	/**
	 * Get employee position from employee data
	 * Reuses logic from RouteMapMaplibre.svelte
	 */
	function getEmployeePosition(employee: Employee): { lat: number; lon: number } {
		const DEFAULT_LOCATION = { lat: 52.0907, lon: 5.1214 }; // Utrecht, Netherlands

		if (employee.location) {
			try {
				let locationData: Coordinate;
				if (typeof employee.location === 'string') {
					locationData = JSON.parse(employee.location);
				} else if (typeof employee.location === 'object') {
					locationData = employee.location as Coordinate;
				} else {
					throw new Error('Invalid location format');
				}
				return { lat: locationData.lat, lon: locationData.lon };
			} catch (e) {
				log.warn(`[EmployeeMarkers] Invalid location data for employee ${employee.name}:`, e);
			}
		}
		return DEFAULT_LOCATION;
	}

	/**
	 * Get employee position - either interpolated along route or static location
	 */
	function getEmployeeCurrentPosition(employee: Employee): { lat: number; lon: number } {
		const fed = $fullEmployeeData.find((fed) => fed.employee.id === employee.id);
		if (!fed) {
			return getEmployeePosition(employee);
		}

		const activeJob = fed.activeJob;
		const travelJob = fed.travelJob;
		const hasActiveJob = activeJob && activeJob.startTime;
		const hasTravelJob = travelJob && travelJob.startTime;

		if (hasActiveJob || hasTravelJob) {
			// Employee is on an active job or travel - calculate animated position
			const currentJob = hasActiveJob ? activeJob : travelJob;
			const startTime = new Date(currentJob!.startTime!).getTime();
			const currentTime = Date.now();
			const elapsedSeconds = (currentTime - startTime) / 1000;

			// Find route path for this employee
			const routePath = getRoutePathForEmployee(employee.id);
			if (routePath && routePath.length > 0) {
				const interpolatedPosition = interpolateLocationAtTime(routePath, elapsedSeconds);
				if (interpolatedPosition) {
					return interpolatedPosition;
				}
			}
		}

		// Employee is idle or interpolation failed - use base location
		return getEmployeePosition(employee);
	}

	/**
	 * Get route path for an employee from displayedRoutes
	 */
	function getRoutePathForEmployee(employeeId: string): PathPoint[] | null {
		// Route IDs for active routes are in format: "active-{activeJobId}"
		// Route IDs for travel routes are in format: "travel-{travelJobId}"
		const fed = $fullEmployeeData.find((fed) => fed.employee.id === employeeId);
		if (!fed) return null;

		// Check for active job route
		if (fed.activeJob && fed.activeJob.startTime) {
			const activeRoute = $displayedRoutes.find(
				(routeDisplay) => routeDisplay.route.id === `active-${fed.activeJob!.id}`
			);
			if (activeRoute && activeRoute.route.path) {
				return activeRoute.route.path;
			}
		}

		// Check for travel job route
		if (fed.travelJob && fed.travelJob.startTime) {
			const travelRoute = $displayedRoutes.find(
				(routeDisplay) => routeDisplay.route.id === `travel-${fed.travelJob!.id}`
			);
			if (travelRoute && travelRoute.route.path) {
				return travelRoute.route.path;
			}
		}

		return null;
	}

	/**
	 * Update employee positions GeoJSON from current employee data
	 */
	function updateEmployeePositions() {
		const features: Feature<Point>[] = $fullEmployeeData.map((fed) => {
			const employee = fed.employee;
			const position = getEmployeeCurrentPosition(employee);
			const isSelected = employee.id === $selectedEmployee;

			// Determine if employee is animated (on active/travel job)
			const hasActiveJob = fed.activeJob && fed.activeJob.startTime;
			const hasTravelJob = fed.travelJob && fed.travelJob.startTime;
			const isAnimated = hasActiveJob || hasTravelJob;

			return {
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [position.lon, position.lat] // GeoJSON uses [lng, lat]
				},
				properties: {
					employeeId: employee.id,
					employeeName: employee.name,
					isSelected: isSelected,
					isAnimated: isAnimated
				}
			};
		});

		employeeGeoJson = {
			type: 'FeatureCollection',
			features
		};
	}

	/**
	 * Start animation loop
	 */
	function startAnimation() {
		if (animationInterval) {
			clearInterval(animationInterval);
		}

		animationInterval = setInterval(() => {
			// Check if any employees are currently on active jobs or travel jobs
			const hasAnimatedEmployees = $fullEmployeeData.some((fed) => {
				return (
					(fed.activeJob && fed.activeJob.startTime) ||
					(fed.travelJob && fed.travelJob.startTime)
				);
			});

			if (hasAnimatedEmployees) {
				// Update animation timestamp to trigger position updates
				animationTimestamp = Date.now();
			}
		}, ANIMATION_INTERVAL_MS);
	}

	// Reactive: Update positions when employee data changes
	$: {
		if ($fullEmployeeData) {
			updateEmployeePositions();
		}
	}

	// Reactive: Update positions when selected employee changes (for styling)
	$: {
		if ($selectedEmployee !== undefined) {
			updateEmployeePositions();
		}
	}

	// Reactive: Update positions when displayed routes change (for route-based interpolation)
	$: {
		if ($displayedRoutes) {
			updateEmployeePositions();
		}
	}

	// Reactive: Update positions when animation timestamp changes
	$: {
		if (animationTimestamp > 0) {
			updateEmployeePositions();
		}
	}

	onMount(() => {
		startAnimation();
	});

	onDestroy(() => {
		if (animationInterval) {
			clearInterval(animationInterval);
		}
	});
</script>

<!-- TODO: Replace CircleLayer with emoji symbols (SymbolLayer) - currently not working, needs investigation -->
<GeoJSONSource id="employee-positions" data={employeeGeoJson}>
	<CircleLayer
		id="employee-markers"
		paint={{
			'circle-radius': [
				'case',
				['==', ['get', 'isSelected'], true],
				8, // Larger radius for selected employee
				6 // Normal radius
			],
			'circle-color': [
				'case',
				['==', ['get', 'isSelected'], true],
				'#dc2626', // Red for selected
				['==', ['get', 'isAnimated'], true],
				'#3b82f6', // Blue for animated (on job/travel)
				'#10b981' // Green for idle
			],
			'circle-stroke-width': [
				'case',
				['==', ['get', 'isSelected'], true],
				2, // Thicker stroke for selected
				1 // Normal stroke
			],
			'circle-stroke-color': '#ffffff',
			'circle-opacity': 0.9
		}}
	/>
</GeoJSONSource>
