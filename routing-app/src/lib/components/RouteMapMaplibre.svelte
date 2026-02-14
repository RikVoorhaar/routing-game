<script lang="ts">
	import { onMount } from 'svelte';
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import { displayedRoutes } from '$lib/stores/mapDisplay';
	import { getRoute } from '$lib/stores/routeCache';
	import EmployeeMarkers from './map/maplibre/EmployeeMarkers.svelte';
	import RegionBorders from './map/maplibre/RegionBorders.svelte';
	import PlacesLayer from './map/maplibre/PlacesLayer.svelte';
	import PlacePopup from './map/maplibre/PlacePopup.svelte';
	import type { Employee, Coordinate, PathPoint } from '$lib/server/db/schema';
	import type { DisplayableRoute } from '$lib/stores/mapDisplay';
	import type { Place } from '$lib/stores/placesCache';
	import { log } from '$lib/logger';
	import type { Map as MapLibreMap, StyleSpecification, MapMouseEvent } from 'maplibre-gl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const DEFAULT_CENTER: [number, number] = [5.1214, 52.0907];
	const DEFAULT_ZOOM = 13;

	// Map instance reference
	let mapInstance: MapLibreMap | undefined = undefined;

	// Track last handled employee ID to prevent re-triggering on tab switches
	let lastHandledEmployeeId: string | null = null;

	// POI popup state
	let selectedPlace: Place | null = null;
	let popupLngLat: [number, number] | null = null;
	let popupPixelPosition: { x: number; y: number } | null = null;
	let clickHandlerSetup = false;

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
				layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } }]
			} as StyleSpecification;
		}
	});

	// Setup map state persistence and click handler when map instance is available
	$: {
		if (mapInstance) {
			setupMapStatePersistence();
			setupClickHandler();
		}
	}

	// Update popup position when popup location changes
	$: {
		if (mapInstance && popupLngLat) {
			updatePopupPosition();
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

					if (
						parsedRouteData?.path &&
						Array.isArray(parsedRouteData.path) &&
						parsedRouteData.path.length > 0
					) {
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

	/**
	 * Handle map click - detect POI clicks and show popup
	 */
	function handleMapClick(e: MapMouseEvent) {
		if (!mapInstance) return;

		// Query features at click point on the places icons layer
		const features = mapInstance.queryRenderedFeatures(e.point, {
			layers: ['places-icons']
		});

		if (features && features.length > 0) {
			const feature = features[0];
			const props = feature.properties || {};

			// Extract place data from feature
			// GeoJSON features use camelCase (placeId, categoryName, regionCode)
			// Vector tile features use snake_case (place_id, category_name, region_code)
			const placeId = Number(props.placeId ?? props.place_id ?? 0);
			const category = props.categoryName ?? props.category_name ?? 'Unknown';
			const region = props.regionCode ?? props.region_code ?? null;

			// Extract coordinates from geometry (Point: [lng, lat])
			let lng: number | null = null;
			let lat: number | null = null;

			if (feature.geometry && feature.geometry.type === 'Point' && feature.geometry.coordinates) {
				const coords = feature.geometry.coordinates as [number, number];
				lng = coords[0];
				lat = coords[1];
			}

			if (placeId && lat !== null && lng !== null) {
				selectedPlace = {
					id: placeId,
					category,
					lat,
					lon: lng,
					region
				};
				popupLngLat = [lng, lat];
				updatePopupPosition();
			} else {
				log.warn('[RouteMapMaplibre] Invalid feature data:', { placeId, lat, lng, props });
			}
		} else {
			// Clicked outside POI - close popup
			selectedPlace = null;
			popupLngLat = null;
			popupPixelPosition = null;
		}
	}

	/**
	 * Update popup pixel position based on current map view
	 */
	function updatePopupPosition() {
		if (!mapInstance || !popupLngLat) {
			popupPixelPosition = null;
			return;
		}

		try {
			const point = mapInstance.project(popupLngLat);
			popupPixelPosition = { x: point.x, y: point.y };
		} catch (error) {
			log.warn('[RouteMapMaplibre] Failed to project popup position:', error);
			popupPixelPosition = null;
		}
	}

	/**
	 * Setup click handler and map movement listeners when map instance is available
	 */
	function setupClickHandler() {
		if (!mapInstance || clickHandlerSetup) return;

		mapInstance.on('click', handleMapClick);

		// Update popup position when map moves
		mapInstance.on('move', () => {
			if (popupLngLat) {
				updatePopupPosition();
			}
		});

		mapInstance.on('moveend', () => {
			if (popupLngLat) {
				updatePopupPosition();
			}
		});

		mapInstance.on('zoom', () => {
			if (popupLngLat) {
				updatePopupPosition();
			}
		});

		mapInstance.on('zoomend', () => {
			if (popupLngLat) {
				updatePopupPosition();
			}
		});

		clickHandlerSetup = true;
		log.debug('[RouteMapMaplibre] Click handler and movement listeners setup complete');
	}

	/**
	 * Close popup
	 */
	function closePopup() {
		selectedPlace = null;
		popupLngLat = null;
		popupPixelPosition = null;
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

	// Track current zoom for debug display
	let currentZoomDisplay = mapZoom;
	let zoomListenerSetup = false;

	// Setup zoom listener when map instance is available
	$: {
		if (mapInstance && !zoomListenerSetup) {
			const map = mapInstance;
			currentZoomDisplay = map.getZoom();
			map.on('zoom', () => {
				currentZoomDisplay = map.getZoom();
			});
			map.on('zoomend', () => {
				currentZoomDisplay = map.getZoom();
			});
			zoomListenerSetup = true;
		}
	}

	// Also update from mapZoom prop
	$: {
		if (mapInstance) {
			currentZoomDisplay = mapInstance.getZoom();
		} else {
			currentZoomDisplay = mapZoom;
		}
	}
</script>

<div class="relative flex h-full min-h-[400px] w-full flex-col">
	<div class="relative min-h-0 flex-1">
		{#if mapStyle}
			<MapLibre
				bind:map={mapInstance}
				style={mapStyle}
				center={mapCenter}
				zoom={mapZoom}
				class="h-full w-full"
				autoloadGlobalCss={true}
			>
				<PlacesLayer {tileServerUrl} mapInstance={mapInstance} />
				<EmployeeMarkers />
				<RegionBorders />
			</MapLibre>
		{:else}
			<div class="flex h-full items-center justify-center">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}

		<!-- POI Popup -->
		{#if selectedPlace && popupPixelPosition}
			<PlacePopup
				place={selectedPlace}
				{popupPixelPosition}
				onClose={closePopup}
				zoom={currentZoomDisplay}
			/>
		{/if}
	</div>
	<!-- Debug zoom display -->
	<div class="flex-shrink-0 bg-base-200 px-2 py-1 text-xs text-base-content">
		Zoom: {currentZoomDisplay.toFixed(2)} | Places visible: {currentZoomDisplay >= 8 ? 'Yes' : 'No'}
		| Regions visible: {currentZoomDisplay <= 7 ? 'Yes' : 'No'}
	</div>
</div>
