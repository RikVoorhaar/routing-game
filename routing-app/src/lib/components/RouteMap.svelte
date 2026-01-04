<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { get } from 'svelte/store';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { selectedRoute, selectRoute } from '$lib/stores/selectedRoute';
	import { selectedActiveJobData } from '$lib/stores/selectedJob';
	import { cheatSettings, activeTiles } from '$lib/stores/cheats';
	import { mapDisplaySettings, displayedRoutes, mapDisplayActions } from '$lib/stores/mapDisplay';
	import { regionOverlayEnabled, NUTS_HOVER_MAX_ZOOM } from '$lib/stores/regionOverlay';
	import { loadNutsGeoJson, createNutsLayer, setNutsInteractivity } from '$lib/map/nutsOverlay';
	import { MapManager } from './map/MapManager';
	import MarkerRenderer from './map/MarkerRenderer.svelte';
	import RouteRenderer from './map/RouteRenderer.svelte';
	import { allSearchResultJobs, jobSearchActions } from '$lib/stores/jobSearch';
	import type {
		Employee,
		Address,
		Coordinate,
		RoutingResult,
		PathPoint
	} from '$lib/server/db/schema';
	import type { DisplayableRoute } from '$lib/stores/mapDisplay';
	import { formatAddress } from '$lib/formatting';
	import { log } from '$lib/logger';
	import { getRoute, prefetchRoutes } from '$lib/stores/routeCache';

	// Animation configuration
	const ANIMATION_FPS = 30; // Frames per second for smooth animation
	const ANIMATION_INTERVAL_MS = 1000 / ANIMATION_FPS; // ~33ms for 30 FPS

	// Map configuration
	let mapElement: HTMLDivElement;
	let leafletMap: any = null;
	let L: any = null;

	// Manager instances
	let mapManager: MapManager | null = null;
	let markerRenderer: any = null; // Reference to MarkerRenderer component

	// Animation state
	let animationInterval: NodeJS.Timeout | null = null;

	// Job loading state
	let jobLoadingTimeout: NodeJS.Timeout | null = null;

	// Route markers management
	let routeMarkers: any[] = []; // Keep track of route markers for cleanup

	// Animation timestamp to trigger marker updates
	let animationTimestamp = 0;

	// NUTS overlay layer management
	let nutsLayer: any = null;
	let zoomEndHandler: (() => void) | null = null;

	// Derived: Map employee IDs to their route paths for animation
	$: routesByEmployee = $displayedRoutes.reduce(
		(acc, routeDisplay) => {
			// Route IDs for active routes are in format: "active-{activeJobId}"
			if (routeDisplay.isActive && routeDisplay.route.id.startsWith('active-')) {
				const activeJobId = routeDisplay.route.id.replace('active-', '');
				// Find the employee who has this active job
				const fed = $fullEmployeeData.find((fed) => fed.activeJob?.id === activeJobId);
				if (fed && routeDisplay.route.path && Array.isArray(routeDisplay.route.path)) {
					acc[fed.employee.id] = routeDisplay.route.path;
				}
			}
			return acc;
		},
		{} as Record<string, PathPoint[]>
	);

	// Reactive updates
	$: {
		if (leafletMap) {
			updateDisplayedRoutes();
		}
	}

	// Reactive updates for selected employee
	$: {
		if (leafletMap && $selectedEmployee) {
			handleEmployeeSelection($selectedEmployee);
		}
	}

	// Reactive updates for selected route
	$: {
		if (leafletMap && $selectedRoute !== undefined) {
			updateDisplayedRoutes();
		}
	}

	// Reactive updates for selected active job data (preview route)
	$: {
		if (leafletMap && $selectedActiveJobData) {
			updateDisplayedRoutes();
		}
	}

	// Reactive updates for full employee data (active routes)
	$: {
		if (leafletMap && $fullEmployeeData) {
			updateDisplayedRoutes();
		}
	}

	// Reactive updates for region overlay
	$: {
		if (leafletMap && L) {
			handleRegionOverlayToggle($regionOverlayEnabled);
		}
	}

	/**
	 * Handle region overlay toggle
	 */
	async function handleRegionOverlayToggle(enabled: boolean) {
		if (!leafletMap || !L) return;

		if (enabled) {
			// Enable overlay: load GeoJSON and add layer
			if (!nutsLayer) {
				try {
					const geojson = await loadNutsGeoJson();
					nutsLayer = createNutsLayer(L, geojson);
					nutsLayer.addTo(leafletMap);
					// Keep overlay below routes/markers but above tiles
					nutsLayer.bringToBack();

					// Setup zoom event handler for interactivity gating
					if (!zoomEndHandler) {
						zoomEndHandler = () => {
							updateNutsInteractivity();
						};
						leafletMap.on('zoomend', zoomEndHandler);
					}

					// Set initial interactivity state
					updateNutsInteractivity();
				} catch (error) {
					log.error('[RouteMap] Failed to load NUTS overlay:', error);
				}
			} else {
				// Layer already exists, just add it back
				if (!leafletMap.hasLayer(nutsLayer)) {
					nutsLayer.addTo(leafletMap);
					nutsLayer.bringToBack();
				}
				updateNutsInteractivity();
			}
		} else {
			// Disable overlay: remove layer
			if (nutsLayer && leafletMap.hasLayer(nutsLayer)) {
				leafletMap.removeLayer(nutsLayer);
			}
		}
	}

	/**
	 * Update NUTS layer interactivity based on current zoom level
	 */
	function updateNutsInteractivity() {
		if (!leafletMap || !L || !nutsLayer) return;

		setNutsInteractivity({
			map: leafletMap,
			layer: nutsLayer,
			enabled: $regionOverlayEnabled,
			hoverMaxZoom: NUTS_HOVER_MAX_ZOOM
		});
	}

	async function initMap() {
		if (!browser) return;

		try {
		// Initialize map manager (no tile callback needed since tile-based loading is deprecated)
		mapManager = new MapManager(mapElement);
		const { map, L: leafletLib } = await mapManager.init();
		leafletMap = map;
		L = leafletLib;

		// Initial map update
		updateDisplayedRoutes();

			// Start animation loop
			startAnimation();
		} catch (error) {
			log.error('[RouteMap] Failed to initialize map:', error);
		}
	}

	async function updateDisplayedRoutes() {
		if (!leafletMap || !L) return;

		// Clear existing routes and markers
		mapDisplayActions.clearRoutes();
		clearRouteMarkers();

		// Prefetch routes for all active jobs
		const activeJobIds: string[] = [];
		if ($selectedActiveJobData?.activeJob?.id) {
			activeJobIds.push($selectedActiveJobData.activeJob.id);
		}
		$fullEmployeeData.forEach((fed) => {
			if (fed.activeJob?.id && fed.activeJob.startTime) {
				activeJobIds.push(fed.activeJob.id);
			}
		});
		await prefetchRoutes(activeJobIds);

		// 1. Display preview route from selected active job data (if any)
		// Only show preview if the active job hasn't been started yet (no startTime)
		if ($selectedActiveJobData && !$selectedActiveJobData.activeJob.startTime) {
			// Double-check that this active job hasn't been started by checking fullEmployeeData
			// This prevents showing preview routes for jobs that have been accepted
			const isJobAlreadyStarted = $fullEmployeeData.some(
				(fed) =>
					fed.activeJob?.id === $selectedActiveJobData.activeJob.id && fed.activeJob?.startTime
			);

			if (!isJobAlreadyStarted) {
				const previewRoute = await createRouteFromActiveJobData($selectedActiveJobData, 'preview');
				if (previewRoute) {
					mapDisplayActions.addRoute(previewRoute, {
						isSelected: false,
						isPreview: true,
						color: '#ff6b35', // Orange color for preview
						onClick: () => {
							selectRoute(previewRoute.id);
							zoomToRoute(previewRoute);
						}
					});

					// Add markers for preview route
					addRouteMarkers($selectedActiveJobData, 'preview');
				} else {
					log.warn('[RouteMap] Failed to create preview route');
				}
			}
		}

		// 2. Display all active job routes for employees
		for (const fed of $fullEmployeeData) {
			if (fed.activeJob && fed.activeJob.startTime) {
				const activeRoute = await createRouteFromFullEmployeeData(fed);
				if (activeRoute) {
					const isSelected = activeRoute.id === $selectedRoute;
					mapDisplayActions.addRoute(activeRoute, {
						isSelected,
						isActive: true,
						color: isSelected ? '#00d4aa' : '#0080ff', // Teal for selected, blue for active
						onClick: () => {
							selectRoute(activeRoute.id);
							zoomToRoute(activeRoute);
						}
					});

					// Add markers for active route
					addRouteMarkers(fed, 'active');
				}
			}
		}
	}

	function clearRouteMarkers() {
		// Remove all existing route markers from map
		routeMarkers.forEach((marker) => {
			if (marker && leafletMap) {
				leafletMap.removeLayer(marker);
			}
		});
		routeMarkers = [];
	}

	async function createRouteFromActiveJobData(
		selectedActiveJobData: any,
		routeType: string
	): Promise<DisplayableRoute | null> {
		if (!selectedActiveJobData?.activeJob?.id) {
			log.warn('[RouteMap] No active job ID in selectedActiveJobData');
			return null;
		}

		// Fetch route data on-demand
		const routeData = await getRoute(selectedActiveJobData.activeJob.id);
		if (!routeData) {
			log.warn(
				'[RouteMap] Failed to fetch route data for active job:',
				selectedActiveJobData.activeJob.id
			);
			return null;
		}

		// Handle case where routeData might be a JSON string
		let parsedRouteData = routeData;
		if (typeof routeData === 'string') {
			try {
				parsedRouteData = JSON.parse(routeData);
			} catch (e) {
				log.error('[RouteMap] Failed to parse routeData string:', e);
				return null;
			}
		}

		// Validate routeData structure
		if (!parsedRouteData || typeof parsedRouteData !== 'object') {
			log.warn('[RouteMap] Invalid routeData format:', typeof parsedRouteData);
			return null;
		}

		// Check that path exists and is an array
		if (!parsedRouteData.path || !Array.isArray(parsedRouteData.path)) {
			log.warn('[RouteMap] Missing or invalid path in routeData:', {
				hasPath: !!parsedRouteData.path,
				pathType: typeof parsedRouteData.path
			});
			return null;
		}

		// Check that path has at least one point
		if (parsedRouteData.path.length === 0) {
			log.warn('[RouteMap] Empty path array in routeData');
			return null;
		}

		return {
			id: `${routeType}-${selectedActiveJobData.activeJob.id}`,
			path: parsedRouteData.path,
			travelTimeSeconds: parsedRouteData.travelTimeSeconds || 0,
			totalDistanceMeters: parsedRouteData.totalDistanceMeters || 0,
			destination: parsedRouteData.destination,
			startTime: selectedActiveJobData.activeJob.startTime,
			routeData: parsedRouteData
		};
	}

	async function createRouteFromFullEmployeeData(fed: any): Promise<DisplayableRoute | null> {
		if (!fed.activeJob?.id) {
			log.warn('[RouteMap] No active job ID in fullEmployeeData for employee:', fed.employee?.id);
			return null;
		}

		// Fetch route data on-demand
		const routeData = await getRoute(fed.activeJob.id);
		if (!routeData) {
			log.warn('[RouteMap] Failed to fetch route data for active job:', fed.activeJob.id);
			return null;
		}

		// Handle case where routeData might be a JSON string
		let parsedRouteData = routeData;
		if (typeof routeData === 'string') {
			try {
				parsedRouteData = JSON.parse(routeData);
			} catch (e) {
				log.error('[RouteMap] Failed to parse routeData string:', e);
				return null;
			}
		}

		// Validate routeData structure
		if (!parsedRouteData || typeof parsedRouteData !== 'object') {
			log.warn('[RouteMap] Invalid routeData format:', typeof parsedRouteData);
			return null;
		}

		// Check that path exists and is an array
		if (!parsedRouteData.path || !Array.isArray(parsedRouteData.path)) {
			log.warn('[RouteMap] Missing or invalid path in routeData:', {
				hasPath: !!parsedRouteData.path,
				pathType: typeof parsedRouteData.path,
				employeeId: fed.employee?.id
			});
			return null;
		}

		// Check that path has at least one point
		if (parsedRouteData.path.length === 0) {
			log.warn('[RouteMap] Empty path array in routeData for employee:', fed.employee?.id);
			return null;
		}

		return {
			id: `active-${fed.activeJob.id}`,
			path: parsedRouteData.path,
			travelTimeSeconds: parsedRouteData.travelTimeSeconds || 0,
			totalDistanceMeters: parsedRouteData.totalDistanceMeters || 0,
			destination: parsedRouteData.destination,
			startTime: fed.activeJob.startTime,
			routeData: parsedRouteData
		};
	}

	function addRouteMarkers(data: any, routeType: string) {
		if (!leafletMap || !L) return;

		const { employeeStartLocation, jobPickupAddress, jobDeliverAddress } = data;

		// Marker styles
		const markerStyles: Record<string, any> = {
			preview: {
				start: { color: '#ff6b35', icon: '🚀' },
				job: { color: '#ff6b35', icon: '📦' },
				end: { color: '#ff6b35', icon: '🏠' }
			},
			active: {
				start: { color: '#0080ff', icon: '🚗' },
				job: { color: '#00d4aa', icon: '🎯' },
				end: { color: '#0080ff', icon: '🏁' }
			}
		};

		const style = markerStyles[routeType] || markerStyles.active;

		// Add start marker (employeeStartLocation is a Coordinate, not an Address)
		if (employeeStartLocation) {
			const startMarker = L.marker([employeeStartLocation.lat, employeeStartLocation.lon], {
				icon: createCustomIcon(style.start.icon, style.start.color)
			}).addTo(leafletMap);
			startMarker.bindPopup(
				`${routeType === 'preview' ? 'Preview' : 'Active'} Route Start<br/>${employeeStartLocation.lat.toFixed(6)}, ${employeeStartLocation.lon.toFixed(6)}`
			);
			routeMarkers.push(startMarker);
		}

		// Add job marker
		if (jobPickupAddress) {
			const jobMarker = L.marker([jobPickupAddress.lat, jobPickupAddress.lon], {
				icon: createCustomIcon(style.job.icon, style.job.color)
			}).addTo(leafletMap);
			jobMarker.bindPopup(`Job Pickup Location<br/>${formatAddress(jobPickupAddress)}`);
			routeMarkers.push(jobMarker);
		}

		// Add end marker
		if (jobDeliverAddress) {
			const endMarker = L.marker([jobDeliverAddress.lat, jobDeliverAddress.lon], {
				icon: createCustomIcon(style.end.icon, style.end.color)
			}).addTo(leafletMap);
			endMarker.bindPopup(
				`${routeType === 'preview' ? 'Preview' : 'Active'} Route End<br/>${formatAddress(jobDeliverAddress)}`
			);
			routeMarkers.push(endMarker);
		}
	}

	function createCustomIcon(emoji: string, color: string) {
		if (!L) return null;

		return L.divIcon({
			html: `<div style="
				background-color: ${color};
				border: 2px solid white;
				border-radius: 50%;
				width: 30px;
				height: 30px;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 16px;
				box-shadow: 0 2px 4px rgba(0,0,0,0.2);
			">${emoji}</div>`,
			className: 'custom-div-icon',
			iconSize: [30, 30],
			iconAnchor: [15, 15]
		});
	}

	function showAvailableRoutes(routes: any[]) {
		const allCoords: [number, number][] = [];

		routes.forEach((route) => {
			const isSelected = route.id === $selectedRoute;
			mapDisplayActions.addRoute(route, {
				isSelected,
				isAvailable: true,
				onClick: () => {
					selectRoute(route.id);
					zoomToRoute(route);
				}
			});

			// Collect coordinates for bounds calculation
			const routeData = parseRouteData(route.routeData);
			const routeCoords = routeData.map(
				(point) => [point.coordinates.lat, point.coordinates.lon] as [number, number]
			);
			allCoords.push(...routeCoords);
		});

		// Zoom to fit all available routes
		if (allCoords.length > 0 && L) {
			const bounds = L.latLngBounds(allCoords);
			leafletMap.fitBounds(bounds, { padding: [30, 30] });
		}
	}

	function zoomToRoute(route: DisplayableRoute) {
		if (!leafletMap || !L) return;

		const routeData = route.path || (route.routeData ? parseRouteData(route.routeData) : []);
		if (routeData.length > 0) {
			const routeCoords = routeData.map((point: any) => [
				point.coordinates.lat,
				point.coordinates.lon
			]);
			const bounds = L.latLngBounds(routeCoords);
			leafletMap.fitBounds(bounds, { padding: [20, 20] });
		}
	}

	function parseRouteData(routeDataString: string | object): any[] {
		try {
			if (typeof routeDataString === 'string') {
				return JSON.parse(routeDataString);
			} else if (typeof routeDataString === 'object' && Array.isArray(routeDataString)) {
				return routeDataString;
			} else {
				return [];
			}
		} catch (e) {
			return [];
		}
	}

	function startAnimation() {
		if (animationInterval) {
			clearInterval(animationInterval);
		}

		animationInterval = setInterval(() => {
			// Check if any employees are currently on active jobs
			const hasAnimatedEmployees = $fullEmployeeData.some((fed) => {
				return fed.activeJob && fed.activeJob.startTime;
			});

			if (hasAnimatedEmployees) {
				// Update animation timestamp to trigger marker position updates
				animationTimestamp = Date.now();
				// Trigger reactivity for route updates
				updateDisplayedRoutes();
			}
		}, ANIMATION_INTERVAL_MS); // Update every ~33ms for smooth animation
	}

	function handleEmployeeSelection(employeeId: string) {
		const fed = $fullEmployeeData.find((fed) => fed.employee.id === employeeId);
		if (!fed || !leafletMap) return;

		if (fed.activeJob && fed.activeJob.startTime && fed.activeRoute) {
			// Employee is on an active job - zoom to show the job route
			const activeRoute = createRouteFromFullEmployeeData(fed);
			if (activeRoute) {
				zoomToRoute(activeRoute);
			}
		} else {
			// Employee is idle - just pan to employee location
			const position = getEmployeePosition(fed.employee);
			leafletMap.setView([position.lat, position.lon], leafletMap.getZoom());
		}

		// Update displayed routes to show selection
		updateDisplayedRoutes();
	}

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
				log.warn(`[RouteMap] Invalid location data for employee ${employee.name}:`, e);
			}
		}
		return DEFAULT_LOCATION;
	}

	// Reactive: Update job markers when search results change
	$: if (markerRenderer && leafletMap && $allSearchResultJobs) {
		// Render all search result jobs (visible at all zoom levels)
		if (markerRenderer.renderSearchResultJobs && $allSearchResultJobs.length > 0) {
			markerRenderer.renderSearchResultJobs($allSearchResultJobs);
		} else if (markerRenderer.clearSearchResultJobs) {
			// Clear markers if no search results
			markerRenderer.clearSearchResultJobs();
		}
	}

	function loadJobsForVisibleTiles() {
		// Disabled: We now use employee-driven job search instead of tile-based loading
		// This function is kept for MapManager compatibility but does nothing
		return;
	}

	onMount(() => {
		initMap();
	});

	onDestroy(() => {
		if (animationInterval) {
			clearInterval(animationInterval);
		}

		if (jobLoadingTimeout) {
			clearTimeout(jobLoadingTimeout);
		}

		// Cleanup NUTS overlay
		if (zoomEndHandler && leafletMap) {
			leafletMap.off('zoomend', zoomEndHandler);
			zoomEndHandler = null;
		}

		if (nutsLayer && leafletMap) {
			leafletMap.removeLayer(nutsLayer);
			nutsLayer = null;
		}

		if (mapManager) {
			mapManager.destroy();
		}
	});
</script>

<!-- Import Leaflet CSS -->
<svelte:head>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<div class="map-container">
	<div bind:this={mapElement} class="map-element"></div>

	<!-- Render markers and routes -->
	{#if leafletMap && L}
		<MarkerRenderer
			bind:this={markerRenderer}
			map={leafletMap}
			{L}
			employees={$fullEmployeeData.map((fed) => fed.employee)}
			activeJobsByEmployee={$fullEmployeeData.reduce(
				(acc, fed) => {
					if (fed.activeJob) {
						acc[fed.employee.id] = fed.activeJob;
					}
					return acc;
				},
				{} as Record<string, any>
			)}
			{routesByEmployee}
			{animationTimestamp}
		/>

		<RouteRenderer map={leafletMap} {L} routes={$displayedRoutes} />
	{/if}
</div>

<!-- Tile Debug Display -->
{#if $cheatSettings.showTileDebug}
	<div class="mt-4">
		<div class="card bg-base-200 shadow-sm">
			<div class="card-body p-4">
				<h4 class="card-title text-sm text-base-content/70">
					🗺️ Active Map Tiles ({$activeTiles.size})
				</h4>
				<div
					class="max-h-30 scrollbar-thin scrollbar-thumb-gray-300 flex flex-wrap gap-1 overflow-y-auto"
				>
					{#each Array.from($activeTiles).sort() as tile}
						<span class="badge badge-outline badge-sm">{tile}</span>
					{/each}
					{#if $activeTiles.size === 0}
						<span class="text-xs text-base-content/50">No active tiles</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.map-container {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.map-element {
		width: 100%;
		height: 100%;
		min-height: 400px;
	}
</style>
