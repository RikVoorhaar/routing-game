<script lang="ts">
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import { displayedRoutes } from '$lib/stores/mapDisplay';
	import { getRoute } from '$lib/stores/routeCache';
	import type { Employee, Coordinate, PathPoint } from '$lib/server/db/schema';
	import type { DisplayableRoute } from '$lib/stores/mapDisplay';
	import { log } from '$lib/logger';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const defaultCenter: [number, number] = [5.1214, 52.0907];
	const defaultZoom = 13;

	// Map instance reference
	let mapInstance: MapLibreMap | null = null;

	// Europe basemap: Planetiler MBTiles (OpenMapTiles schema) via Martin. Overlay: PostGIS active_places.
	const tileServerUrl = getTileServerUrl();
	const baseStyle = {
		version: 8 as const,
		sources: {
			europe: {
				type: 'vector' as const,
				url: `${tileServerUrl}/europe`,
				maxzoom: 15,
				attribution: '© <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			}
		},
		layers: [
			{ id: 'background', type: 'background' as const, paint: { 'background-color': '#f8f4f0' } },
			{
				id: 'water',
				type: 'fill' as const,
				source: 'europe',
				'source-layer': 'water',
				filter: ['==', ['get', 'natural'], 'water'],
				paint: { 'fill-color': '#aad3df' }
			},
			{
				id: 'landuse',
				type: 'fill' as const,
				source: 'europe',
				'source-layer': 'landuse',
				filter: ['in', ['get', 'landuse'], ['literal', ['forest', 'grass', 'park']]],
				paint: {
					'fill-color': [
						'match',
						['get', 'landuse'],
						'forest',
						'#cdebb0',
						'grass',
						'#e5f5c0',
						'park',
						'#c8e6a0',
						'#eaeaea'
					]
				}
			},
			{
				id: 'transportation',
				type: 'line' as const,
				source: 'europe',
				'source-layer': 'transportation',
				filter: ['has', 'class'],
				paint: {
					'line-color': [
						'match',
						['get', 'class'],
						'motorway',
						'#e892a2',
						'trunk',
						'#f2b3a3',
						'primary',
						'#f2d29b',
						'secondary',
						'#ffffff',
						'#cccccc'
					],
					'line-width': [
						'interpolate',
						['linear'],
						['zoom'],
						5,
						0.5,
						10,
						2,
						15,
						4
					]
				}
			}
		]
	};

	const martinActivePlacesUrl = `${tileServerUrl}/active_places_with_geom`;

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
	 */
	async function handleEmployeeSelection(employeeId: string) {
		if (!mapInstance) return;

		const fed = $fullEmployeeData.find((fed) => fed.employee.id === employeeId);
		if (!fed) return;

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


	// Reactive: Handle selected employee changes
	$: {
		if (mapInstance && $selectedEmployee) {
			handleEmployeeSelection($selectedEmployee);
		}
	}
</script>

<div class="h-full w-full min-h-[400px]">
	<MapLibre
		bind:map={mapInstance}
		style={baseStyle}
		center={defaultCenter}
		zoom={defaultZoom}
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
	</MapLibre>
</div>
