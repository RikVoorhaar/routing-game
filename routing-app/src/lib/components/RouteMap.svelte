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
	import { MapManager } from './map/MapManager';
	import { JobLoader } from './map/JobLoader';
	import MarkerRenderer from './map/MarkerRenderer.svelte';
	import RouteRenderer from './map/RouteRenderer.svelte';
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

	// Animation configuration
	const ANIMATION_FPS = 30; // Frames per second for smooth animation
	const ANIMATION_INTERVAL_MS = 1000 / ANIMATION_FPS; // ~33ms for 30 FPS

	// Map configuration
	let mapElement: HTMLDivElement;
	let leafletMap: any = null;
	let L: any = null;

	// Manager instances
	let mapManager: MapManager | null = null;
	let jobLoader: JobLoader | null = null;
	let markerRenderer: any = null; // Reference to MarkerRenderer component

	// Animation state
	let animationInterval: NodeJS.Timeout | null = null;

	// Job loading state
	let jobLoadingTimeout: NodeJS.Timeout | null = null;

	// Route markers management
	let routeMarkers: any[] = []; // Keep track of route markers for cleanup

	// Animation timestamp to trigger marker updates
	let animationTimestamp = 0;

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

	async function initMap() {
		if (!browser) return;

		try {
			// Initialize map manager
			mapManager = new MapManager(mapElement, loadJobsForVisibleTiles);
			const { map, L: leafletLib } = await mapManager.init();
			leafletMap = map;
			L = leafletLib;

			// Initialize job loader
			jobLoader = new JobLoader();

			// Initial map update
			updateDisplayedRoutes();

			// Load initial jobs (non-blocking)
			loadJobsForVisibleTiles();

			// Start animation loop
			startAnimation();
		} catch (error) {
			log.error('[RouteMap] Failed to initialize map:', error);
		}
	}

	function updateDisplayedRoutes() {
		if (!leafletMap || !L) return;

		// Clear existing routes and markers
		mapDisplayActions.clearRoutes();
		clearRouteMarkers();

		// 1. Display preview route from selected active job data (if any)
		if ($selectedActiveJobData) {
			const previewRoute = createRouteFromActiveJobData($selectedActiveJobData, 'preview');
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

		// 2. Display all active job routes for employees
		$fullEmployeeData.forEach((fed) => {
			if (fed.activeJob && fed.activeRoute && fed.activeJob.startTime) {
				const activeRoute = createRouteFromFullEmployeeData(fed);
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
		});
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

	function createRouteFromActiveJobData(
		selectedActiveJobData: any,
		routeType: string
	): DisplayableRoute | null {
		if (!selectedActiveJobData?.activeRoute?.routeData) {
			log.warn('[RouteMap] No route data in selectedActiveJobData');
			return null;
		}

		const routeData = selectedActiveJobData.activeRoute.routeData;

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

	function createRouteFromFullEmployeeData(fed: any): DisplayableRoute | null {
		if (!fed.activeRoute?.routeData) {
			log.warn('[RouteMap] No route data in fullEmployeeData for employee:', fed.employee?.id);
			return null;
		}

		const routeData = fed.activeRoute.routeData;

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

	function loadJobsForVisibleTiles() {
		// Clear any existing timeout to debounce the calls
		if (jobLoadingTimeout) {
			clearTimeout(jobLoadingTimeout);
		}

		// Debounce job loading by 300ms to avoid excessive calls during panning/zooming
		jobLoadingTimeout = setTimeout(async () => {
			if (!mapManager || !jobLoader) {
				log.warn('[RouteMap] loadJobsForVisibleTiles called but managers not initialized');
				return;
			}

			try {
				const visibleTiles = mapManager.getVisibleTiles();
				const zoomThreshold = get(mapDisplaySettings).jobZoomThreshold;

				log.debug(
					'[RouteMap] Loading jobs for tiles:',
					visibleTiles.length,
					'tiles, zoom threshold:',
					zoomThreshold
				);

				// Load jobs in the background
				const result = await jobLoader.loadJobsForTiles(visibleTiles, zoomThreshold);

				// Handle tile-based updates
				if (result) {
					log.debug(
						'[RouteMap] Tile changes - New tiles:',
						result.newTiles.length,
						'Removed tiles:',
						result.removedTiles.length
					);

					// Handle tile-based rendering directly instead of updating the store
					if (markerRenderer) {
						// Remove markers for unloaded tiles
						result.removedTiles.forEach((tileKey) => {
							if (markerRenderer.clearTileJobs) {
								markerRenderer.clearTileJobs(tileKey);
							}
						});

						// Add markers for new tiles
						result.newTiles.forEach((tileKey) => {
							const tileJobs = jobLoader?.getJobsForTile(tileKey) || [];
							if (markerRenderer.renderTileJobs && tileJobs.length > 0) {
								markerRenderer.renderTileJobs(tileKey, tileJobs);
							}
						});
					}

					// Note: No longer updating currentMapJobs store since we're doing tile-based rendering
				} else {
					log.debug('[RouteMap] No tile changes, skipping job update');
				}
			} catch (error) {
				log.error('[RouteMap] Error loading jobs:', error);
			}
		}, 300); // 300ms debounce
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

		if (mapManager) {
			mapManager.destroy();
		}

		if (jobLoader) {
			jobLoader.clearJobs();
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
			routesByEmployee={$fullEmployeeData.reduce(
				(acc, fed) => {
					if (fed.activeRoute?.routeData) {
						const routeData = fed.activeRoute.routeData;
						// Handle string parsing if needed
						let parsedRouteData = routeData;
						if (typeof routeData === 'string') {
							try {
								parsedRouteData = JSON.parse(routeData);
							} catch (e) {
								log.error('[RouteMap] Failed to parse routeData for employee:', fed.employee.id, e);
								return acc;
							}
						}
						if (parsedRouteData?.path && Array.isArray(parsedRouteData.path)) {
							acc[fed.employee.id] = parsedRouteData.path;
						}
					}
					return acc;
				},
				{} as Record<string, PathPoint[]>
			)}
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
