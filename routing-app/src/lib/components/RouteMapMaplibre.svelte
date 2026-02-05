<script lang="ts">
	import { onMount } from 'svelte';
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import { displayedRoutes } from '$lib/stores/mapDisplay';
	import { getRoute } from '$lib/stores/routeCache';
	import EmployeeMarkers from './map/maplibre/EmployeeMarkers.svelte';
	import type { Employee, Coordinate, PathPoint } from '$lib/server/db/schema';
	import type { DisplayableRoute } from '$lib/stores/mapDisplay';
	import { log } from '$lib/logger';
	import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const DEFAULT_CENTER: [number, number] = [5.1214, 52.0907];
	const DEFAULT_ZOOM = 13;

	// Map instance reference
	let mapInstance: MapLibreMap | undefined = undefined;

	// Track last handled employee ID to prevent re-triggering on tab switches
	let lastHandledEmployeeId: string | null = null;

	// Map state persistence key
	const MAP_STATE_KEY = 'maplibre-map-state';

	// Get initial map state from localStorage or use defaults
	function getInitialMapState(): { center: [number, number]; zoom: number } {
		if (typeof window === 'undefined') {
			return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
		}

		try {
			const stored = localStorage.getItem(MAP_STATE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				if (parsed.center && parsed.zoom) {
					return {
						center: parsed.center as [number, number],
						zoom: parsed.zoom as number
					};
				}
			}
		} catch (e) {
			log.warn('[RouteMapMaplibre] Failed to load map state from localStorage:', e);
		}

		return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
	}

	// Store map state to localStorage
	function saveMapState() {
		if (!mapInstance || typeof window === 'undefined') return;

		try {
			const center = mapInstance.getCenter();
			const zoom = mapInstance.getZoom();
			localStorage.setItem(
				MAP_STATE_KEY,
				JSON.stringify({
					center: [center.lng, center.lat],
					zoom: zoom
				})
			);
		} catch (e) {
			log.warn('[RouteMapMaplibre] Failed to save map state to localStorage:', e);
		}
	}

	const initialMapState = getInitialMapState();
	let mapCenter = initialMapState.center;
	let mapZoom = initialMapState.zoom;

	// Europe basemap: Planetiler MBTiles (OpenMapTiles schema) via Martin. Overlay: PostGIS active_places.
	const tileServerUrl = getTileServerUrl();
	const martinActivePlacesUrl = `${tileServerUrl}/active_places_with_geom`;

	// Load map style from JSON file
	let mapStyle: StyleSpecification | null = null;

	onMount(async () => {
		try {
			const response = await fetch('/map-style.json');
			if (!response.ok) {
				throw new Error(`Failed to fetch map style: ${response.statusText}`);
			}
			const styleJson = await response.json();
			
			// Replace hardcoded URL with dynamic tile server URL
			if (styleJson.sources?.europe) {
				styleJson.sources.europe.url = `${tileServerUrl}/europe`;
			}
			
			mapStyle = styleJson as StyleSpecification;
			log.debug('[RouteMapMaplibre] Loaded map style from JSON');
		} catch (error) {
			log.error('[RouteMapMaplibre] Failed to load map style JSON:', error);
			// Fallback to a minimal style if JSON fails to load
			mapStyle = {
				version: 8,
				sources: {
					europe: {
						type: 'vector',
						url: `${tileServerUrl}/europe`,
						maxzoom: 15
					}
				},
				layers: [
					{ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } }
				]
			} as StyleSpecification;
		}
	});

	// Setup map state persistence when map instance is available
	$: {
		if (mapInstance) {
			setupMapStatePersistence();
		}
	}

	/**
	 * Get employee position from employee data
	 * Reuses logic from Leaflet's RouteMap.svelte
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
				log.warn(`[RouteMapMaplibre] Invalid location data for employee ${employee.name}:`, e);
			}
		}
		return DEFAULT_LOCATION;
	}

	/**
	 * Calculate bounds from route path points
	 */
	function calculateBoundsFromPath(path: PathPoint[]): [[number, number], [number, number]] | null {
		if (!path || path.length === 0) return null;

		let minLng = Infinity;
		let maxLng = -Infinity;
		let minLat = Infinity;
		let maxLat = -Infinity;

		for (const point of path) {
			const lon = point.coordinates.lon;
			const lat = point.coordinates.lat;
			minLng = Math.min(minLng, lon);
			maxLng = Math.max(maxLng, lon);
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);
		}

		if (minLng === Infinity || minLat === Infinity) return null;

		return [
			[minLng, minLat],
			[maxLng, maxLat]
		];
	}

	/**
	 * Handle employee selection - pan/zoom to employee or their route
	 * Only triggers when employeeId actually changes (not on tab switches)
	 */
	async function handleEmployeeSelection(employeeId: string) {
		if (!mapInstance) return;

		// Don't re-trigger if we've already handled this employee
		if (lastHandledEmployeeId === employeeId) {
			return;
		}

		const fed = $fullEmployeeData.find((fed) => fed.employee.id === employeeId);
		if (!fed) return;

		// Mark this employee as handled
		lastHandledEmployeeId = employeeId;

		// Check if employee has an active job with route
		if (fed.activeJob && fed.activeJob.startTime) {
			// Employee is on an active job - zoom to show the job route
			try {
				const routeData = await getRoute(fed.activeJob.id);
				if (routeData) {
					// Handle case where routeData might be a JSON string
					let parsedRouteData = routeData;
					if (typeof routeData === 'string') {
						try {
							parsedRouteData = JSON.parse(routeData);
						} catch (e) {
							log.error('[RouteMapMaplibre] Failed to parse routeData string:', e);
							// Fall through to pan to employee position
						}
					}

					if (parsedRouteData?.path && Array.isArray(parsedRouteData.path) && parsedRouteData.path.length > 0) {
						const bounds = calculateBoundsFromPath(parsedRouteData.path);
						if (bounds) {
							mapInstance.fitBounds(bounds, { padding: 20 });
							return;
						}
					}
				}
			} catch (error) {
				log.error('[RouteMapMaplibre] Error fetching route for active job:', error);
				// Fall through to pan to employee position
			}
		}

		// Employee is idle or route fetch failed - pan to employee location
		const position = getEmployeePosition(fed.employee);
		const currentZoom = mapInstance.getZoom();
		mapInstance.flyTo({
			center: [position.lon, position.lat],
			zoom: currentZoom > 14 ? currentZoom : 14
		});
	}

	// Track if persistence is already set up
	let persistenceSetup = false;

	// Track map movement to save state
	function setupMapStatePersistence() {
		if (!mapInstance || persistenceSetup) return;

		// Save state on moveend (pan/zoom complete)
		mapInstance.on('moveend', () => {
			saveMapState();
		});

		persistenceSetup = true;
	}

	// Reactive: Setup persistence when map instance is available
	$: {
		if (mapInstance && !persistenceSetup) {
			setupMapStatePersistence();
		}
	}

	// Reactive: Handle selected employee changes (only when actually changing)
	$: {
		if (mapInstance && $selectedEmployee && $selectedEmployee !== lastHandledEmployeeId) {
			handleEmployeeSelection($selectedEmployee);
		}
	}

	// Reset last handled ID when selectedEmployee is cleared
	$: {
		if (!$selectedEmployee) {
			lastHandledEmployeeId = null;
		}
	}
</script>

<div class="h-full w-full min-h-[400px]">
	{#if mapStyle}
		<MapLibre
			bind:map={mapInstance}
			style={mapStyle}
			center={mapCenter}
			zoom={mapZoom}
			class="h-full w-full"
			autoloadGlobalCss={true}
		>
			<VectorTileSource id="martin-active-places" url={martinActivePlacesUrl}>
				<CircleLayer
					id="active-places-circles"
					sourceLayer="active_places_with_geom"
					paint={{
						'circle-radius': 4,
						'circle-color': '#2563eb',
						'circle-stroke-width': 1,
						'circle-stroke-color': '#fff'
					}}
				/>
			</VectorTileSource>
			<EmployeeMarkers />
		</MapLibre>
	{:else}
		<div class="flex h-full items-center justify-center">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{/if}
</div>
