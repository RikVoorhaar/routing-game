<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getPlacesForVisibleTilesGrouped } from '$lib/map/placesGetter';
	import type { PlaceFilterPredicate } from '$lib/map/placesLimiter';
	import { createPlacePopupHTML } from './popups/placePopup';
	import type { Place } from '$lib/stores/placesCache';
	import { log } from '$lib/logger';
	import { placeGoods } from '$lib/stores/placeGoods';
	import { currentGameState } from '$lib/stores/gameData';
	import { placeFilter } from '$lib/stores/placeFilter';
	import { get } from 'svelte/store';
	import type { PlaceGoodsConfig } from '$lib/config/placeGoodsTypes';
	import { selectPlaceGoods } from '$lib/places/placeGoodsSelection';
	import type { PlaceFilter } from '$lib/stores/placeFilter';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import { computePlaceRoute } from '$lib/routes/placeRouteCompute';
	import { generateSupplyAmount } from '$lib/places/supplyAmount';
	import { computeCompleteJobValue } from '$lib/jobs/jobValue';
	import { getVehicleConfig } from '$lib/vehicles/vehicleUtils';
	import { config } from '$lib/stores/config';
	import { computeJobXp } from '$lib/jobs/jobUtils';
	import { mapGoodToCategory } from '$lib/jobs/goodToCategory';

	export let map: any;
	export let L: any;
	export let visibleTiles: string[] = [];
	export let zoom: number = 0;
	export let filterPredicate: PlaceFilterPredicate<Place> = () => true;
	export let selectedPlaceId: number | null = null;

	let MarkerClusterGroup: any = null;
	let clusterGroupsByTile: Map<string, any> = new Map();
	let defaultIcon: any = null; // Cached marker icon
	let selectedIcon: any = null; // Cached selected marker icon
	let placeGoodsConfig: PlaceGoodsConfig | null = null;
	let selectedMarker: any = null; // Directly rendered selected marker (not in cluster)
	let selectedSupplyPlace: Place | null = null; // Track selected supply place
	let placeRoutePolylines: any[] = []; // Track route polylines for cleanup

	/**
	 * Initialize MarkerClusterGroup class
	 */
	async function initMarkerClusterClass(): Promise<void> {
		if (!map || !L || MarkerClusterGroup) return;

		try {
			// Import leaflet.markercluster - it attaches to L namespace
			await import('leaflet.markercluster');

			// After import, MarkerClusterGroup should be available on L
			MarkerClusterGroup = (L as any).MarkerClusterGroup;

			if (!MarkerClusterGroup) {
				log.error('[PlacesRenderer] Failed to get MarkerClusterGroup from L namespace');
				return;
			}

			// Create cached default icon
			defaultIcon = L.icon({
				iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
				iconRetinaUrl:
					'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
				shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
				iconSize: [25, 41],
				iconAnchor: [12, 41],
				popupAnchor: [1, -34],
				tooltipAnchor: [16, -28],
				shadowSize: [41, 41]
			});

			// Create cached selected icon (red marker)
			selectedIcon = L.icon({
				iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
				iconRetinaUrl:
					'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
				shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
				iconSize: [25, 41],
				iconAnchor: [12, 41],
				popupAnchor: [1, -34],
				tooltipAnchor: [16, -28],
				shadowSize: [41, 41]
			});

			log.debug('[PlacesRenderer] MarkerClusterGroup class initialized');
		} catch (error) {
			log.error('[PlacesRenderer] Error initializing MarkerClusterGroup:', error);
		}
	}

	/**
	 * Get cluster options configuration
	 */
	function getClusterOptions(): any {
		return {
			chunkedLoading: true,
			chunkInterval: 200, // ms per batch
			chunkDelay: 50, // ms delay between batches
			maxClusterRadius: 50,
			disableClusteringAtZoom: 15,
			removeOutsideVisibleBounds: true,
			animate: false,
			spiderfyOnMaxZoom: false,
			showCoverageOnHover: false,
			zoomOnClick: true
		};
	}

	/**
	 * Create a marker for a place
	 */
	function createMarker(place: Place): any {
		// Check if this place is selected
		const currentFilter = get(placeFilter);
		const isSelected = currentFilter?.selectedPlaceId === place.id;
		
		const marker = L.marker([place.lat, place.lon], {
			icon: isSelected ? (selectedIcon || defaultIcon) : defaultIcon,
			title: `${place.category} (${place.id})`
		});

		// Get current place goods config from store
		const currentConfig = get(placeGoods) || placeGoodsConfig;

		// Compute selected goods if we have game state seed and config
		let selectedGoods: { type: 'supply' | 'demand'; good: string } | null = null;
		let supplyAmount: number | null = null;
		let vehicleCapacity: number | null = null;
		let jobValue: number | null = null;
		let routeDuration: number | null = null;
		let jobXp: number | null = null;
		
		const gameState = get(currentGameState);
		const employeeId = get(selectedEmployee);
		const employeeData = employeeId
			? get(fullEmployeeData).find((fed) => fed.employee.id === employeeId)
			: null;
		
		if (gameState?.seed && currentConfig) {
			const categoryGoods = currentConfig.categories.find((cat) => cat.name === place.category);
			if (categoryGoods) {
				selectedGoods = selectPlaceGoods(gameState.seed, place.id, categoryGoods);
				
				// Compute supply amount for suppliers
				if (selectedGoods.type === 'supply') {
					supplyAmount = generateSupplyAmount(gameState.seed, place.id, categoryGoods);
					
					// Get vehicle capacity if employee is selected
					if (employeeData) {
						const vehicleConfig = getVehicleConfig(employeeData.employee.vehicleLevel);
						vehicleCapacity = vehicleConfig?.capacity ?? null;
						
						// Compute job value estimate
						const goodValue = currentConfig.goods?.[selectedGoods.good]?.value_per_kg ?? 0;
						const currentConfigStore = get(config);
						if (goodValue > 0 && vehicleCapacity !== null && currentConfigStore) {
							jobValue = computeCompleteJobValue(
								goodValue,
								supplyAmount,
								vehicleCapacity,
								gameState.seed,
								place.id,
								gameState,
								currentConfigStore.jobs.value.randomFactorMax
							);
						}
					}
				}
			}
		}

		// Create popup with selected goods, supply amount, and job value
		const popupContent = createPlacePopupHTML(
			place,
			currentConfig,
			selectedGoods,
			supplyAmount,
			vehicleCapacity,
			jobValue,
			routeDuration,
			jobXp,
			selectedSupplyPlace?.id ?? null
		);
		const popup = L.popup({
			maxWidth: 250,
			className: 'place-tooltip-popup',
			autoPan: false, // Disable auto-panning to prevent sticky centering
			closeOnClick: false
		}).setContent(popupContent);

		marker.bindPopup(popup);
		
		// Set up accept job button handler for demand nodes
		if (selectedGoods?.type === 'demand' && selectedSupplyPlace) {
			marker.on('popupopen', () => {
				setTimeout(() => {
					const acceptButton = document.getElementById(`accept-job-btn-${place.id}`);
					if (acceptButton) {
						acceptButton.onclick = async () => {
							await handleAcceptJob(selectedSupplyPlace!, place);
							marker.closePopup();
						};
					}
				}, 10);
			});
		}

		// Add click handler to set/clear filter and compute routes
		marker.on('click', async () => {
			const currentFilter = get(placeFilter);
			const employeeId = get(selectedEmployee);
			const employeeData = employeeId
				? get(fullEmployeeData).find((fed) => fed.employee.id === employeeId)
				: null;
			
			// If filter is already set for this place, clear it (toggle behavior)
			if (currentFilter && currentFilter.selectedPlaceId === place.id) {
				placeFilter.set(null);
				selectedSupplyPlace = null;
				clearPlaceRoutes();
				return;
			}
			
			// If we have selected goods, set the filter
			if (selectedGoods) {
				// For supply nodes: filter to show demand nodes
				// For demand nodes: don't change filter, just select this node
				if (selectedGoods.type === 'supply') {
					const filter: PlaceFilter = {
						selectedPlaceId: place.id,
						selectedGood: selectedGoods.good,
						filterType: selectedGoods.type,
						targetType: 'demand' // Show demand nodes
					};
					placeFilter.set(filter);
					selectedSupplyPlace = place;
					clearPlaceRoutes(); // Clear any existing routes before computing new ones
					
					// Compute route from employee location to supply place
					if (employeeData && employeeData.employee.location) {
						setTimeout(async () => {
							const routeResult = await computeRouteFromEmployeeToSupply(
								employeeData.employee.id,
								employeeData.employee.location,
								place
							);
							if (!routeResult) {
								log.warn('[PlacesRenderer] Failed to compute route from employee to supply place');
							}
						}, 150);
					}
				} else if (selectedGoods.type === 'demand') {
					// For demand nodes, just select this one without changing the filter
					// This keeps other demand nodes visible
					const filter: PlaceFilter = {
						selectedPlaceId: place.id,
						selectedGood: selectedGoods.good,
						filterType: selectedGoods.type,
						targetType: 'demand' // Keep showing demand nodes
					};
					placeFilter.set(filter);
					
					// If we have a selected supply place, compute route and update popup
					const gameStateValue = get(currentGameState);
					const currentConfigValue = get(placeGoods) || placeGoodsConfig;
					if (selectedSupplyPlace && employeeData && gameStateValue && currentConfigValue) {
						// Wait for selected marker to be rendered
						setTimeout(async () => {
							const currentSelectedMarker = selectedMarker;
							if (currentSelectedMarker && map.hasLayer(currentSelectedMarker)) {
								await computeRouteFromSupplyToDemand(
									employeeData.employee.id,
									selectedSupplyPlace,
									place
								);
								
								// Update popup with route info
								await updateDemandPopupWithRoute(currentSelectedMarker, place, selectedSupplyPlace, employeeData, gameStateValue, currentConfigValue);
								
								// Open popup
								currentSelectedMarker.openPopup();
							}
						}, 150);
					} else {
						// Open popup after a short delay to allow marker to be re-rendered
						setTimeout(() => {
							if (selectedMarker && map.hasLayer(selectedMarker)) {
								selectedMarker.openPopup();
							}
						}, 100);
					}
				}
			}
		});

		return marker;
	}

	/**
	 * Load markers for a single tile
	 */
	async function loadTileMarkers(tileKey: string, places: Place[]): Promise<void> {
		if (!map || !L || !MarkerClusterGroup || !defaultIcon) {
			log.warn('[PlacesRenderer] Cannot load tile markers - not initialized');
			return;
		}

		// Remove existing cluster group for this tile if it exists (to prevent duplicates)
		const existingClusterGroup = clusterGroupsByTile.get(tileKey);
		if (existingClusterGroup) {
			map.removeLayer(existingClusterGroup);
			existingClusterGroup.clearLayers();
			clusterGroupsByTile.delete(tileKey);
		}

		// Filter places
		const filteredPlaces = places.filter(filterPredicate);

		// Separate selected place from others (selected place should not be clustered)
		const selectedPlace = selectedPlaceId
			? filteredPlaces.find((p) => p.id === selectedPlaceId)
			: null;
		const placesToCluster = selectedPlace
			? filteredPlaces.filter((p) => p.id !== selectedPlaceId)
			: filteredPlaces;

		if (placesToCluster.length === 0 && !selectedPlace) {
			log.debug(`[PlacesRenderer] No filtered places for tile ${tileKey}`);
			return;
		}

		log.debug(
			`[PlacesRenderer] Loading ${placesToCluster.length} markers for tile ${tileKey}${
				selectedPlace ? ' (selected place excluded from cluster)' : ''
			}`
		);

		// Create markers array (excluding selected place)
		const markers = placesToCluster.map((place) => createMarker(place));

		// Create cluster group for this tile
		const clusterGroup = new MarkerClusterGroup(getClusterOptions());

		// Add markers in batch using addLayers
		clusterGroup.addLayers(markers);

		// Add cluster group to map
		clusterGroup.addTo(map);

		// Track it
		clusterGroupsByTile.set(tileKey, clusterGroup);

		log.debug(`[PlacesRenderer] Created cluster group for tile ${tileKey} with ${markers.length} markers`);

		// If selected place is in this tile, render it directly on map (not in cluster)
		// Only render if it's the currently selected place
		if (selectedPlace) {
			const currentFilter = get(placeFilter);
			// Only render if this matches the current filter selection
			if (currentFilter && currentFilter.selectedPlaceId === selectedPlace.id) {
				// Remove old marker first to avoid duplicates
				removeSelectedMarker();
				renderSelectedMarker(selectedPlace);
			}
		}
	}

	/**
	 * Render selected marker directly on map (not in cluster)
	 */
	function renderSelectedMarker(place: Place): void {
		if (!map || !L || !selectedIcon) {
			return;
		}

		// Remove old selected marker if it exists
		if (selectedMarker) {
			if (map.hasLayer(selectedMarker)) {
				map.removeLayer(selectedMarker);
			}
			selectedMarker = null;
		}

		// Create marker for selected place
		const marker = createMarker(place);
		
		// Add directly to map (not to cluster)
		marker.addTo(map);
		
		// Track it
		selectedMarker = marker;
		
		// Open popup automatically when marker is selected (after a short delay to ensure it's rendered)
		setTimeout(() => {
			if (selectedMarker && map.hasLayer(selectedMarker)) {
				selectedMarker.openPopup();
			}
		}, 50);
		
		log.debug(`[PlacesRenderer] Rendered selected marker for place ${place.id}`);
	}

	/**
	 * Remove selected marker from map
	 */
	function removeSelectedMarker(): void {
		if (selectedMarker && map) {
			map.removeLayer(selectedMarker);
			selectedMarker = null;
			log.debug('[PlacesRenderer] Removed selected marker');
		}
	}

	/**
	 * Unload markers for a single tile
	 */
	function unloadTileMarkers(tileKey: string): void {
		const clusterGroup = clusterGroupsByTile.get(tileKey);
		if (clusterGroup) {
			log.debug(`[PlacesRenderer] Unloading tile ${tileKey}`);
			map.removeLayer(clusterGroup);
			clusterGroup.clearLayers();
			clusterGroupsByTile.delete(tileKey);
		}
	}

	/**
	 * Update markers based on visible tiles
	 */
	async function updateMarkersForTiles(): Promise<void> {
		if (!map || !L || zoom < 6 || visibleTiles.length === 0) {
			log.debug('[PlacesRenderer] Skipping update - conditions not met', {
				hasMap: !!map,
				hasL: !!L,
				zoom,
				visibleTileCount: visibleTiles.length
			});
			return;
		}

		// Ensure MarkerClusterGroup is initialized
		if (!MarkerClusterGroup) {
			await initMarkerClass();
			if (!MarkerClusterGroup) {
				log.error('[PlacesRenderer] Failed to initialize MarkerClusterGroup, cannot update markers');
				return;
			}
		}

		log.debug(`[PlacesRenderer] Updating markers for ${visibleTiles.length} visible tiles at zoom ${zoom}`);

		// Get currently loaded tiles (keys of clusterGroupsByTile)
		const loadedTiles = new Set(clusterGroupsByTile.keys());

		// Get current visible tiles as a set
		const visibleTilesSet = new Set(visibleTiles);

		// Find tiles to remove (loaded but not visible)
		const tilesToRemove = Array.from(loadedTiles).filter((tile) => !visibleTilesSet.has(tile));

		// Find tiles to add (visible but not loaded)
		const tilesToAdd = visibleTiles.filter((tile) => !loadedTiles.has(tile));

		log.debug(
			`[PlacesRenderer] Tiles to remove: ${tilesToRemove.length}, tiles to add: ${tilesToAdd.length}`
		);

		// Remove cluster groups for tiles that left viewport
		tilesToRemove.forEach((tileKey) => {
			unloadTileMarkers(tileKey);
		});

		// Ensure routes persist after marker updates
		// Routes are stored separately and should not be affected by tile loading/unloading
		ensureRoutesPersist();

		// Load places for new tiles
		if (tilesToAdd.length > 0) {
			try {
				// Get places grouped by visible tile
				const placesByTile = await getPlacesForVisibleTilesGrouped(tilesToAdd, zoom);

				// Load tiles incrementally with delays for gradual appearance
				for (let i = 0; i < tilesToAdd.length; i++) {
					const tileKey = tilesToAdd[i];
					const places = placesByTile.get(tileKey) || [];

					// Load this tile's markers
					await loadTileMarkers(tileKey, places);

					// Add delay between tiles for gradual loading (except for last tile)
					if (i < tilesToAdd.length - 1) {
						await new Promise((resolve) => setTimeout(resolve, 50));
					}
				}

				// After loading all tiles, check if selected place needs to be rendered
				// (it might be in a newly loaded tile)
				if (selectedPlaceId) {
					// Find selected place in all loaded tiles
					for (const [tileKey, places] of placesByTile.entries()) {
						const selectedPlace = places.find((p) => p.id === selectedPlaceId);
						if (selectedPlace) {
							renderSelectedMarker(selectedPlace);
							break;
						}
					}
				}

				const totalMarkers = Array.from(clusterGroupsByTile.values()).reduce(
					(sum, clusterGroup) => sum + clusterGroup.getLayers().length,
					0
				);
				log.debug(
					`[PlacesRenderer] Finished loading. Total markers across ${clusterGroupsByTile.size} tiles: ${totalMarkers}`
				);
				
				// Ensure routes persist after loading new tiles
				ensureRoutesPersist();
			} catch (error) {
				log.error('[PlacesRenderer] Error loading places for new tiles:', error);
			}
		}
	}

	// Load place goods config on component initialization
	(async () => {
		try {
			await placeGoods.load();
			placeGoodsConfig = get(placeGoods);
			log.debug('[PlacesRenderer] Place goods config loaded');
		} catch (error) {
			log.error('[PlacesRenderer] Failed to load place goods config:', error);
		}
	})();

	// Reactive: Initialize MarkerClusterGroup class when map and L are available
	$: if (map && L && !MarkerClusterGroup) {
		initMarkerClusterClass();
	}

	// Reactive: Update place goods config when store changes
	$: {
		const config = get(placeGoods);
		if (config) {
			placeGoodsConfig = config;
		}
	}

	// Track previous visible tiles and zoom to detect actual changes
	let lastVisibleTiles: string[] = [];
	let lastZoom: number = 0;
	let updateTimeout: ReturnType<typeof setTimeout> | null = null;
	
	// Reactive: Update markers when visible tiles or zoom actually changes
	$: if (map && L && MarkerClusterGroup && visibleTiles.length > 0 && zoom >= 6) {
		// Check if tiles or zoom actually changed
		const tilesChanged = 
			visibleTiles.length !== lastVisibleTiles.length ||
			!visibleTiles.every((tile, i) => tile === lastVisibleTiles[i]) ||
			zoom !== lastZoom;
		
		if (tilesChanged) {
			// Debounce rapid updates (e.g., during panning)
			if (updateTimeout) {
				clearTimeout(updateTimeout);
			}
			
			updateTimeout = setTimeout(() => {
				lastVisibleTiles = [...visibleTiles];
				lastZoom = zoom;
				updateMarkersForTiles();
			}, 150); // 150ms debounce
		}
	}

	// Track placeFilter to detect filter changes
	let lastFilterPlaceId: number | null = null;
	$: {
		const currentFilter = get(placeFilter);
		const currentPlaceId = currentFilter?.selectedPlaceId ?? null;
		
		// Only reload if filter actually changed
		if (currentPlaceId !== lastFilterPlaceId) {
			lastFilterPlaceId = currentPlaceId;
			
			if (
				map &&
				L &&
				MarkerClusterGroup &&
				clusterGroupsByTile.size > 0 &&
				visibleTiles.length > 0 &&
				zoom >= 6
			) {
				// Filter changed - need to reload all currently loaded tiles
				// Remove selected marker first (it will be re-added if still selected)
				removeSelectedMarker();
				clearPlaceRoutes();
				
				// Reset selectedSupplyPlace when filter is cleared
				if (!currentFilter) {
					selectedSupplyPlace = null;
				}
				
				const currentTiles = Array.from(clusterGroupsByTile.keys());
				// Unload all existing cluster groups
				currentTiles.forEach((tileKey) => {
					unloadTileMarkers(tileKey);
				});
				// Reload with new filter
				updateMarkersForTiles();
			}
		}
	}

	// Reactive: Update selected marker when selectedPlaceId changes
	$: if (map && L && MarkerClusterGroup && selectedPlaceId !== null && visibleTiles.length > 0 && zoom >= 6) {
		// Selected place changed - find and render it
		// Wait a bit for tiles to load, then update
		setTimeout(() => {
			updateSelectedMarkerFromLoadedTiles();
		}, 100);
	}

	// Reactive: Remove selected marker when selection is cleared
	$: if (selectedPlaceId === null && selectedMarker) {
		removeSelectedMarker();
		selectedSupplyPlace = null;
		clearPlaceRoutes();
	}

	/**
	 * Update selected marker by finding it in currently loaded tiles
	 */
	async function updateSelectedMarkerFromLoadedTiles(): Promise<void> {
		if (!selectedPlaceId || !map || !L) {
			return;
		}

		// Get places for visible tiles to find the selected place
		try {
			const placesByTile = await getPlacesForVisibleTilesGrouped(visibleTiles, zoom);
			for (const places of placesByTile.values()) {
				const selectedPlace = places.find((p) => p.id === selectedPlaceId);
				if (selectedPlace) {
					renderSelectedMarker(selectedPlace);
					return;
				}
			}
		} catch (error) {
			log.error('[PlacesRenderer] Error updating selected marker:', error);
		}
	}

	/**
	 * Compute route from employee location to supply place
	 */
	async function computeRouteFromEmployeeToSupply(
		employeeId: string,
		employeeLocation: { lat: number; lon: number },
		supplyPlace: Place
	): Promise<any | null> {
		if (!map || !L || !employeeId || !employeeLocation || !supplyPlace) return null;
		
		// Validate coordinates
		if (!isValidCoordinate(employeeLocation) || !isValidCoordinate({ lat: supplyPlace.lat, lon: supplyPlace.lon })) {
			log.warn('[PlacesRenderer] Invalid coordinates for route computation', {
				employeeLocation,
				supplyPlace: { lat: supplyPlace.lat, lon: supplyPlace.lon }
			});
			return null;
		}
		
		try {
			log.info(
				`[PlacesRenderer] Computing route from employee to supply ${supplyPlace.id}`
			);
			
			const routeResult = await computeRouteFromCoordinates(
				employeeId,
				employeeLocation,
				{ lat: supplyPlace.lat, lon: supplyPlace.lon }
			);
			
			if (routeResult && routeResult.path && routeResult.path.length > 0) {
				// Display route on map
				displayPlaceRoute(routeResult);
				return routeResult;
			} else {
				log.warn('[PlacesRenderer] No route found from employee to supply place');
				return null;
			}
		} catch (error) {
			log.error('[PlacesRenderer] Error computing route from employee to supply:', error);
			return null;
		}
	}
	
	/**
	 * Compute route from supply place to demand place
	 */
	async function computeRouteFromSupplyToDemand(
		employeeId: string,
		supplyPlace: Place,
		demandPlace: Place
	): Promise<any | null> {
		if (!map || !L || !employeeId || !supplyPlace || !demandPlace) return null;
		
		// Validate coordinates
		if (!isValidCoordinate({ lat: supplyPlace.lat, lon: supplyPlace.lon }) || 
			!isValidCoordinate({ lat: demandPlace.lat, lon: demandPlace.lon })) {
			log.warn('[PlacesRenderer] Invalid coordinates for route computation', {
				supplyPlace: { lat: supplyPlace.lat, lon: supplyPlace.lon },
				demandPlace: { lat: demandPlace.lat, lon: demandPlace.lon }
			});
			return null;
		}
		
		try {
			log.info(
				`[PlacesRenderer] Computing route from supply ${supplyPlace.id} to demand ${demandPlace.id}`
			);
			
			const routeResult = await computePlaceRoute(employeeId, supplyPlace.id, demandPlace.id);
			
			if (routeResult && routeResult.path && routeResult.path.length > 0) {
				// Display route on map (blue dashed for supply to demand)
				displayPlaceRoute(routeResult, '#3b82f6', true);
				return routeResult;
			} else {
				log.warn('[PlacesRenderer] No route found between places');
				return null;
			}
		} catch (error) {
			log.error('[PlacesRenderer] Error computing route:', error);
			return null;
		}
	}
	
	/**
	 * Validate coordinate
	 */
	function isValidCoordinate(coord: { lat: number; lon: number }): boolean {
		return (
			typeof coord.lat === 'number' &&
			typeof coord.lon === 'number' &&
			!isNaN(coord.lat) &&
			!isNaN(coord.lon) &&
			coord.lat >= -90 &&
			coord.lat <= 90 &&
			coord.lon >= -180 &&
			coord.lon <= 180
		);
	}
	
	/**
	 * Compute route from coordinates to coordinates
	 */
	async function computeRouteFromCoordinates(
		employeeId: string,
		from: { lat: number; lon: number },
		to: { lat: number; lon: number }
	): Promise<any | null> {
		try {
			const response = await fetch(
				`/api/travel/route?employeeId=${employeeId}&fromLat=${from.lat}&fromLon=${from.lon}&toLat=${to.lat}&toLon=${to.lon}`
			);
			
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				log.error(
					`[PlacesRenderer] Failed to compute route from coordinates: ${response.status} ${errorData.error || 'Unknown error'}`
				);
				return null;
			}
			
			const data = await response.json();
			
			if (!data.success || !data.path || data.path.length === 0) {
				log.warn(`[PlacesRenderer] Route computation failed: ${data.error || 'No path returned'}`);
				return null;
			}
			
			return {
				path: data.path,
				travelTimeSeconds: data.travelTimeSeconds,
				totalDistanceMeters: data.totalDistanceMeters,
				startLocation: from,
				endLocation: to
			};
		} catch (error) {
			log.error('[PlacesRenderer] Error computing route from coordinates:', error);
			return null;
		}
	}
	
	/**
	 * Update demand popup with route information
	 */
	async function updateDemandPopupWithRoute(
		marker: any,
		demandPlace: Place,
		supplyPlace: Place,
		employeeData: any,
		gameState: any,
		placeGoodsConfig: PlaceGoodsConfig
	): Promise<void> {
		if (!marker || !employeeData || !gameState || !placeGoodsConfig) return;
		
		try {
			// Compute route
			const routeResult = await computePlaceRoute(
				employeeData.employee.id,
				supplyPlace.id,
				demandPlace.id
			);
			
			if (!routeResult) return;
			
			// Get category goods for supply place
			const supplyCategoryGoods = placeGoodsConfig.categories.find(
				(cat) => cat.name === supplyPlace.category
			);
			if (!supplyCategoryGoods) return;
			
			const supplyGoods = selectPlaceGoods(gameState.seed, supplyPlace.id, supplyCategoryGoods);
			const supplyAmount = generateSupplyAmount(gameState.seed, supplyPlace.id, supplyCategoryGoods);
			const vehicleConfig = getVehicleConfig(employeeData.employee.vehicleLevel);
			const vehicleCapacity = vehicleConfig?.capacity ?? 0;
			const goodValue = placeGoodsConfig.goods?.[supplyGoods.good]?.value_per_kg ?? 0;
			const currentConfigStore = get(config);
			
			// Compute job value
			let jobValue: number | null = null;
			if (goodValue > 0 && vehicleCapacity > 0 && currentConfigStore) {
				jobValue = computeCompleteJobValue(
					goodValue,
					supplyAmount,
					vehicleCapacity,
					gameState.seed,
					supplyPlace.id,
					gameState,
					currentConfigStore.jobs.value.randomFactorMax
				);
			}
			
			// Compute XP
			// Estimate distance from duration and average speed (assume 60% of max speed as average)
			const employeeMaxSpeed = vehicleConfig?.maxSpeed ?? 50;
			const averageSpeedKmh = employeeMaxSpeed * 0.6;
			const estimatedDistanceKm = (routeResult.travelTimeSeconds * averageSpeedKmh) / 3600;
			const jobCategory = mapGoodToCategory(supplyGoods.good);
			let jobXp: number | null = null;
			if (currentConfigStore) {
				jobXp = computeJobXp(
					{ totalDistanceKm: estimatedDistanceKm, jobCategory } as any,
					currentConfigStore,
					gameState
				);
			}
			
			// Update popup content
			const popupContent = createPlacePopupHTML(
				demandPlace,
				placeGoodsConfig,
				{ type: 'demand', good: supplyGoods.good },
				supplyAmount,
				vehicleCapacity,
				jobValue,
				routeResult.travelTimeSeconds,
				jobXp,
				supplyPlace.id
			);
			
			marker.setPopupContent(popupContent);
			
			// Set up accept button handler
			setTimeout(() => {
				const acceptButton = document.getElementById(`accept-job-btn-${demandPlace.id}`);
				if (acceptButton) {
					acceptButton.onclick = async () => {
						await handleAcceptJob(supplyPlace, demandPlace);
						marker.closePopup();
					};
				}
			}, 10);
		} catch (error) {
			log.error('[PlacesRenderer] Error updating demand popup:', error);
		}
	}
	
	/**
	 * Handle accepting a job from supply and demand places
	 */
	async function handleAcceptJob(supplyPlace: Place, demandPlace: Place): Promise<void> {
		const employeeId = get(selectedEmployee);
		const gameState = get(currentGameState);
		
		if (!employeeId || !gameState) {
			log.warn('[PlacesRenderer] Cannot accept job: missing employee or game state');
			return;
		}
		
		try {
			const response = await fetch('/api/jobs/accept-from-places', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					employeeId,
					gameStateId: gameState.id,
					supplyPlaceId: supplyPlace.id,
					demandPlaceId: demandPlace.id
				})
			});
			
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				log.error(`[PlacesRenderer] Failed to accept job: ${errorData.error || 'Unknown error'}`);
				return;
			}
			
			// Clear filter and routes
			placeFilter.set(null);
			selectedSupplyPlace = null;
			clearPlaceRoutes();
			
			// Reload employee data to show the new active job
			// This will be handled by the parent component
			log.info('[PlacesRenderer] Job accepted successfully');
		} catch (error) {
			log.error('[PlacesRenderer] Error accepting job:', error);
		}
	}
	
	/**
	 * Display route polyline on map
	 * @param routeResult - Route result with path, travelTimeSeconds, totalDistanceMeters
	 * @param color - Optional color for the route (default: blue)
	 * @param isDashed - Whether to use dashed line (default: true)
	 */
	function displayPlaceRoute(routeResult: any, color: string = '#3b82f6', isDashed: boolean = true): void {
		if (!map || !L || !routeResult || !routeResult.path || routeResult.path.length === 0) {
			log.warn('[PlacesRenderer] Cannot display route: invalid route result');
			return;
		}
		
		// Create polyline from route path
		const routeCoords = routeResult.path.map((point: any) => {
			if (!point.coordinates || typeof point.coordinates.lat !== 'number' || typeof point.coordinates.lon !== 'number') {
				log.warn('[PlacesRenderer] Invalid route point:', point);
				return null;
			}
			return [point.coordinates.lat, point.coordinates.lon];
		}).filter((coord: any) => coord !== null);
		
		if (routeCoords.length === 0) {
			log.warn('[PlacesRenderer] No valid coordinates in route path');
			return;
		}
		
		const polylineOptions: any = {
			color,
			weight: 4,
			opacity: 0.7,
			interactive: true // Make routes interactive so they persist
		};
		
		if (isDashed) {
			polylineOptions.dashArray = '10, 5';
		}
		
		const polyline = L.polyline(routeCoords, polylineOptions).addTo(map);
		
		// Add popup with route info
		const durationFormatted = routeResult.travelTimeSeconds
			? `${Math.floor(routeResult.travelTimeSeconds / 60)}m ${Math.floor(routeResult.travelTimeSeconds % 60)}s`
			: 'Unknown';
		const distanceFormatted = routeResult.totalDistanceMeters
			? `${(routeResult.totalDistanceMeters / 1000).toFixed(1)} km`
			: 'Unknown';
		
		polyline.bindPopup(`
			<div>
				<strong>Route Preview</strong><br>
				Duration: ${durationFormatted}<br>
				Distance: ${distanceFormatted}
			</div>
		`);
		
		// Store reference to polyline
		placeRoutePolylines.push(polyline);
		
		// Ensure polyline persists by bringing it to front (above markers)
		polyline.bringToFront();
		
		log.debug(`[PlacesRenderer] Added route polyline, total routes: ${placeRoutePolylines.length}`);
	}
	
	/**
	 * Clear all place route polylines
	 */
	function clearPlaceRoutes(): void {
		placeRoutePolylines.forEach((polyline) => {
			if (polyline && map && map.hasLayer(polyline)) {
				map.removeLayer(polyline);
			}
		});
		placeRoutePolylines = [];
	}
	
	/**
	 * Ensure routes persist on the map even when markers are updated
	 * Routes are stored separately from markers and should not be cleared on pan/zoom
	 */
	function ensureRoutesPersist(): void {
		if (!map || !L) return;
		
		// Filter out any null/undefined polylines
		placeRoutePolylines = placeRoutePolylines.filter((polyline) => polyline !== null && polyline !== undefined);
		
		// Re-add routes to map if they were accidentally removed
		placeRoutePolylines.forEach((polyline) => {
			if (polyline && map && !map.hasLayer(polyline)) {
				log.debug('[PlacesRenderer] Re-adding route polyline to map');
				polyline.addTo(map);
				polyline.bringToFront(); // Ensure routes are visible above markers
			}
		});
	}

	onDestroy(() => {
		// Clear update timeout
		if (updateTimeout) {
			clearTimeout(updateTimeout);
			updateTimeout = null;
		}
		
		// Clean up all cluster groups
		clusterGroupsByTile.forEach((clusterGroup, tileKey) => {
			if (map && clusterGroup) {
				map.removeLayer(clusterGroup);
				clusterGroup.clearLayers();
			}
		});
		clusterGroupsByTile.clear();
		
		// Clean up selected marker
		removeSelectedMarker();
		
		// Clean up place routes
		clearPlaceRoutes();
	});
</script>

<style>
	/* Fix cluster number text visibility - make it white and bold with shadow */
	:global(.marker-cluster-small div),
	:global(.marker-cluster-medium div),
	:global(.marker-cluster-large div) {
		color: white !important;
		font-weight: bold !important;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8) !important;
	}
</style>
