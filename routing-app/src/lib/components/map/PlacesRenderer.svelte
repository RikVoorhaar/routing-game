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
	let supplyIcon: any = null; // Cached supply marker icon (green)
	let demandIcon: any = null; // Cached demand marker icon (orange)
	let placeGoodsConfig: PlaceGoodsConfig | null = null;
	let selectedMarker: any = null; // Directly rendered selected marker (not in cluster)
	let selectedSupplyPlace: Place | null = null; // Track selected supply place
	let supplyMarker: any = null; // Directly rendered supply marker (always visible when selectedSupplyPlace is set)
	let placeRoutePolylines: any[] = []; // Track route polylines for cleanup
	let previousDemandPlaceId: number | null = null; // Track previous demand place ID to detect switching
	let isUpdatingMarkers = false; // Track if we're currently updating markers to prevent duplicate rendering

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

			// Create cached supply icon (green marker)
			supplyIcon = L.icon({
				iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
				iconRetinaUrl:
					'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
				shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
				iconSize: [25, 41],
				iconAnchor: [12, 41],
				popupAnchor: [1, -34],
				tooltipAnchor: [16, -28],
				shadowSize: [41, 41]
			});

			// Create cached demand icon (orange marker)
			demandIcon = L.icon({
				iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
				iconRetinaUrl:
					'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
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
		// Only pass supplyPlaceId for demand nodes (to show Accept Job button)
		const supplyPlaceIdForPopup = selectedGoods?.type === 'demand' ? (selectedSupplyPlace?.id ?? null) : null;
		const popupContent = createPlacePopupHTML(
			place,
			currentConfig,
			selectedGoods,
			supplyAmount,
			vehicleCapacity,
			jobValue,
			routeDuration,
			jobXp,
			supplyPlaceIdForPopup
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
			// This handles both supply and demand nodes
			if (currentFilter && currentFilter.selectedPlaceId === place.id) {
				log.debug(`[PlacesRenderer] Toggling off selection for place ${place.id}`);
				placeFilter.set(null);
				// selectedSupplyPlace and markers will be cleared by reactive statement
				// But we can also clear them immediately for faster response
				selectedSupplyPlace = null;
				removeSupplyMarker();
				removeSelectedMarker();
				clearPlaceRoutes();
				// Immediately reload markers
				if (map && L && MarkerClusterGroup && visibleTiles.length > 0 && zoom >= 6) {
					const currentTiles = Array.from(clusterGroupsByTile.keys());
					if (currentTiles.length > 0) {
						currentTiles.forEach((tileKey) => {
							unloadTileMarkers(tileKey);
						});
						updateMarkersForTiles();
					}
				}
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
					
					// Render supply marker immediately
					setTimeout(() => {
						renderSupplyMarker(place);
					}, 100);
					
					// Immediately reload markers with new filter (don't wait for reactive statement)
					if (map && L && MarkerClusterGroup && visibleTiles.length > 0 && zoom >= 6) {
						// Remove selected marker first
						removeSelectedMarker();
						
						// Reload all currently loaded tiles with new filter
						const currentTiles = Array.from(clusterGroupsByTile.keys());
						currentTiles.forEach((tileKey) => {
							unloadTileMarkers(tileKey);
						});
						// Reload with new filter
						updateMarkersForTiles();
					}
					
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
					// Only allow selecting demand nodes if we have a selected supply place
					if (!selectedSupplyPlace) {
						log.warn('[PlacesRenderer] Cannot select demand node without a selected supply place');
						return;
					}
					
					// Check if we're selecting a different demand node
					const currentFilter = get(placeFilter);
					const isDifferentDemandNode = currentFilter && 
						currentFilter.selectedPlaceId !== place.id && 
						currentFilter.filterType === 'demand';
					
					if (isDifferentDemandNode) {
						// Clear previous demand node's route and marker
						log.debug(`[PlacesRenderer] Switching from demand node ${currentFilter.selectedPlaceId} to ${place.id}`);
						clearPlaceRoutes(); // Remove previous route from map (route stays in cache)
						removeSelectedMarker(); // Remove previous selected marker
						// previousDemandPlaceId will be updated in renderSelectedMarker after new marker is rendered
					}
					
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
	 * Create a supply marker - always shows supply popup, never shows Accept Job button
	 */
	function createSupplyMarker(place: Place): any {
		log.debug(`[PlacesRenderer] createSupplyMarker: Creating supply marker for place ${place.id} at [${place.lat}, ${place.lon}]`);
		const marker = L.marker([place.lat, place.lon], {
			icon: supplyIcon || defaultIcon,
			title: `${place.category} (${place.id}) - Supply`
		});

		// Get current place goods config from store
		const currentConfig = get(placeGoods) || placeGoodsConfig;

		// Compute selected goods - always supply for supply markers
		let selectedGoods: { type: 'supply' | 'demand'; good: string } | null = null;
		let supplyAmount: number | null = null;
		let vehicleCapacity: number | null = null;
		let jobValue: number | null = null;
		
		const gameState = get(currentGameState);
		const employeeId = get(selectedEmployee);
		const employeeData = employeeId
			? get(fullEmployeeData).find((fed) => fed.employee.id === employeeId)
			: null;
		
		if (gameState?.seed && currentConfig) {
			const categoryGoods = currentConfig.categories.find((cat) => cat.name === place.category);
			if (categoryGoods) {
				selectedGoods = selectPlaceGoods(gameState.seed, place.id, categoryGoods);
				
				// Force supply type for supply markers
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
				} else {
					// If somehow this place is not a supply, log warning but continue
					log.warn(`[PlacesRenderer] createSupplyMarker called for non-supply place ${place.id}`);
					selectedGoods = null;
				}
			}
		}

		// Create popup - NEVER pass supplyPlaceId (always null) so Accept Job button never shows
		const popupContent = createPlacePopupHTML(
			place,
			currentConfig,
			selectedGoods,
			supplyAmount,
			vehicleCapacity,
			jobValue,
			null, // routeDuration - not needed for supply markers
			null, // jobXp - not needed for supply markers
			null  // supplyPlaceId - ALWAYS null for supply markers
		);
		const popup = L.popup({
			maxWidth: 250,
			className: 'place-tooltip-popup',
			autoPan: false,
			closeOnClick: false
		}).setContent(popupContent);

		marker.bindPopup(popup);
		
		// NO Accept Job button handler for supply markers

		// Add click handler - clicking supply marker again clears selection
		marker.on('click', () => {
			const currentFilter = get(placeFilter);
			// Check if this supply place is currently selected (either as selectedPlaceId or as selectedSupplyPlace)
			if ((currentFilter && currentFilter.selectedPlaceId === place.id) || 
			    (selectedSupplyPlace && selectedSupplyPlace.id === place.id)) {
				log.debug(`[PlacesRenderer] Deselecting supply place ${place.id}`);
				placeFilter.set(null);
				selectedSupplyPlace = null;
				removeSupplyMarker();
				removeSelectedMarker();
				clearPlaceRoutes();
				// Immediately reload markers with cleared filter
				if (map && L && MarkerClusterGroup && visibleTiles.length > 0 && zoom >= 6) {
					const currentTiles = Array.from(clusterGroupsByTile.keys());
					if (currentTiles.length > 0) {
						currentTiles.forEach((tileKey) => {
							unloadTileMarkers(tileKey);
						});
						updateMarkersForTiles();
					}
				}
			}
		});

		return marker;
	}

	/**
	 * Create a demand marker - always shows demand popup, shows Accept Job button if supply exists
	 */
	function createDemandMarker(place: Place, supplyPlace: Place | null): any {
		log.debug(`[PlacesRenderer] createDemandMarker: Creating demand marker for place ${place.id} at [${place.lat}, ${place.lon}], supply place: ${supplyPlace?.id ?? 'none'}`);
		if (supplyPlace && (place.lat === supplyPlace.lat && place.lon === supplyPlace.lon)) {
			log.error(`[PlacesRenderer] createDemandMarker: WARNING - Demand place ${place.id} has same coordinates as supply place ${supplyPlace.id}!`);
		}
		const marker = L.marker([place.lat, place.lon], {
			icon: demandIcon || selectedIcon || defaultIcon,
			title: `${place.category} (${place.id}) - Demand`
		});

		// Get current place goods config from store
		const currentConfig = get(placeGoods) || placeGoodsConfig;

		// Compute selected goods - always demand for demand markers
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
				
				// Force demand type for demand markers
				if (selectedGoods.type === 'demand') {
					// Get supply amount from supply place if available
					if (supplyPlace) {
						const supplyCategoryGoods = currentConfig.categories.find(
							(cat) => cat.name === supplyPlace.category
						);
						if (supplyCategoryGoods) {
							const supplyGoods = selectPlaceGoods(gameState.seed, supplyPlace.id, supplyCategoryGoods);
							if (supplyGoods.type === 'supply') {
								supplyAmount = generateSupplyAmount(gameState.seed, supplyPlace.id, supplyCategoryGoods);
								
								// Get vehicle capacity if employee is selected
								if (employeeData) {
									const vehicleConfig = getVehicleConfig(employeeData.employee.vehicleLevel);
									vehicleCapacity = vehicleConfig?.capacity ?? null;
									
									// Compute job value estimate
									const goodValue = currentConfig.goods?.[supplyGoods.good]?.value_per_kg ?? 0;
									const currentConfigStore = get(config);
									if (goodValue > 0 && vehicleCapacity !== null && currentConfigStore) {
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
								}
							}
						}
					}
				} else {
					// If somehow this place is not a demand, log warning but continue
					log.warn(`[PlacesRenderer] createDemandMarker called for non-demand place ${place.id}`);
					selectedGoods = null;
				}
			}
		}

		// Create popup - ALWAYS pass supplyPlaceId if supply exists (so Accept Job button shows)
		const supplyPlaceIdForPopup = supplyPlace?.id ?? null;
		const popupContent = createPlacePopupHTML(
			place,
			currentConfig,
			selectedGoods,
			supplyAmount,
			vehicleCapacity,
			jobValue,
			routeDuration,
			jobXp,
			supplyPlaceIdForPopup
		);
		const popup = L.popup({
			maxWidth: 250,
			className: 'place-tooltip-popup',
			autoPan: false,
			closeOnClick: false
		}).setContent(popupContent);

		marker.bindPopup(popup);
		
		// Set up accept job button handler for demand markers if supply exists
		if (selectedGoods?.type === 'demand' && supplyPlace) {
			marker.on('popupopen', () => {
				setTimeout(() => {
					const acceptButton = document.getElementById(`accept-job-btn-${place.id}`);
					if (acceptButton) {
						acceptButton.onclick = async () => {
							await handleAcceptJob(supplyPlace, place);
							marker.closePopup();
						};
					}
				}, 10);
			});
		}

		// Add click handler - demand markers should not clear selection on click
		// The click handler is handled in createMarker for regular markers
		// For specialized markers, clicking should just open the popup
		marker.on('click', () => {
			// Just open the popup - don't clear selection
			marker.openPopup();
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
		// Also include supply place if it's set (so it's always visible)
		const baseFilteredPlaces = places.filter(filterPredicate);
		const filteredPlaces = selectedSupplyPlace && !baseFilteredPlaces.find((p) => p.id === selectedSupplyPlace.id)
			? [...baseFilteredPlaces, selectedSupplyPlace]
			: baseFilteredPlaces;

		// Separate selected place and supply place from others (they should not be clustered)
		const selectedPlace = selectedPlaceId
			? filteredPlaces.find((p) => p.id === selectedPlaceId)
			: null;
		const supplyPlace = selectedSupplyPlace
			? filteredPlaces.find((p) => p.id === selectedSupplyPlace.id)
			: null;
		const placesToCluster = filteredPlaces.filter((p) => {
			if (selectedPlace && p.id === selectedPlace.id) return false;
			if (supplyPlace && p.id === supplyPlace.id) return false;
			return true;
		});

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

		// Don't render selected marker or supply marker here - they're handled by reactive statements
		// to avoid duplicate rendering when multiple tiles reload
	}

	/**
	 * Render selected marker directly on map (not in cluster)
	 */
	function renderSelectedMarker(place: Place): void {
		if (!map || !L) {
			return;
		}

		// Remove old selected marker if it exists
		if (selectedMarker) {
			if (map.hasLayer(selectedMarker)) {
				map.removeLayer(selectedMarker);
			}
			selectedMarker = null;
		}

		// Verify we're not accidentally rendering the supply place as the selected marker
		if (selectedSupplyPlace && place.id === selectedSupplyPlace.id) {
			log.error(`[PlacesRenderer] ERROR: renderSelectedMarker called for supply place ${place.id}! Supply place should be rendered via renderSupplyMarker, not renderSelectedMarker.`);
			return;
		}

		log.debug(`[PlacesRenderer] renderSelectedMarker: Rendering marker for place ${place.id} at [${place.lat}, ${place.lon}]`);

		// Determine marker type by computing goods type for this place
		const currentConfig = get(placeGoods) || placeGoodsConfig;
		const gameState = get(currentGameState);
		let markerType: 'supply' | 'demand' | null = null;
		
		if (gameState?.seed && currentConfig) {
			const categoryGoods = currentConfig.categories.find((cat) => cat.name === place.category);
			if (categoryGoods) {
				const selectedGoods = selectPlaceGoods(gameState.seed, place.id, categoryGoods);
				markerType = selectedGoods.type;
			}
		}

		// Create marker using appropriate specialized function
		let marker: any;
		if (markerType === 'demand') {
			// Demand marker - use createDemandMarker with supply place context
			marker = createDemandMarker(place, selectedSupplyPlace);
		} else if (markerType === 'supply') {
			// Supply marker - use createSupplyMarker (shouldn't happen for selected marker, but handle gracefully)
			log.warn(`[PlacesRenderer] renderSelectedMarker called for supply place ${place.id}, using supply marker`);
			marker = createSupplyMarker(place);
		} else {
			// Fallback to generic createMarker if we can't determine type
			log.warn(`[PlacesRenderer] Could not determine marker type for place ${place.id}, using generic marker`);
			marker = createMarker(place);
		}
		
		// Store place ID in marker options for later verification
		if (marker.options) {
			marker.options.placeId = place.id;
		}
		
		// Verify marker coordinates match place coordinates
		const markerLatLng = marker.getLatLng();
		if (Math.abs(markerLatLng.lat - place.lat) > 0.0001 || Math.abs(markerLatLng.lng - place.lon) > 0.0001) {
			log.error(`[PlacesRenderer] ERROR: Marker coordinates [${markerLatLng.lat}, ${markerLatLng.lng}] don't match place coordinates [${place.lat}, ${place.lon}]!`);
		}
		
		// Add directly to map (not to cluster)
		marker.addTo(map);
		
		// Track it
		selectedMarker = marker;
		
		// If this is a demand marker, compute route and update popup
		if (markerType === 'demand' && selectedSupplyPlace) {
			const employeeId = get(selectedEmployee);
			const employeeData = employeeId
				? get(fullEmployeeData).find((fed) => fed.employee.id === employeeId)
				: null;
			const gameStateValue = get(currentGameState);
			const currentConfigValue = get(placeGoods) || placeGoodsConfig;
			
			// Check if we're switching from a different demand node
			const isSwitchingDemandNode = previousDemandPlaceId !== null && previousDemandPlaceId !== place.id;
			
			if (isSwitchingDemandNode) {
				// Clear previous route when switching demand nodes
				log.debug(`[PlacesRenderer] Switching from demand node ${previousDemandPlaceId} to ${place.id}, clearing previous route`);
				clearPlaceRoutes();
			}
			
			// Update tracked previous demand place ID
			previousDemandPlaceId = place.id;
			
			if (employeeData && gameStateValue && currentConfigValue) {
				// Wait a bit for marker to be fully rendered, then compute route
				setTimeout(async () => {
					if (selectedMarker && map.hasLayer(selectedMarker)) {
						log.debug(`[PlacesRenderer] Computing route for demand marker ${place.id}`);
						await computeRouteFromSupplyToDemand(
							employeeData.employee.id,
							selectedSupplyPlace,
							place
						);
						
						// Update popup with route info
						await updateDemandPopupWithRoute(selectedMarker, place, selectedSupplyPlace, employeeData, gameStateValue, currentConfigValue);
						
						// Open popup
						selectedMarker.openPopup();
					}
				}, 200);
			} else {
				// Open popup without route info
				setTimeout(() => {
					if (selectedMarker && map.hasLayer(selectedMarker)) {
						selectedMarker.openPopup();
					}
				}, 50);
			}
		} else {
			// Open popup automatically when marker is selected (after a short delay to ensure it's rendered)
			setTimeout(() => {
				if (selectedMarker && map.hasLayer(selectedMarker)) {
					selectedMarker.openPopup();
				}
			}, 50);
		}
		
		log.debug(`[PlacesRenderer] Rendered selected marker for place ${place.id} (type: ${markerType}) at [${place.lat}, ${place.lon}]`);
	}

	/**
	 * Remove selected marker from map
	 */
	function removeSelectedMarker(): void {
		if (selectedMarker && map) {
			try {
				if (map.hasLayer(selectedMarker)) {
					map.removeLayer(selectedMarker);
				}
			} catch (error) {
				// Marker might already be removed, ignore error
				log.debug('[PlacesRenderer] Error removing selected marker (may already be removed)');
			}
			selectedMarker = null;
			log.debug('[PlacesRenderer] Removed selected marker');
		}
	}
	
	/**
	 * Render supply marker directly on map (always visible when selectedSupplyPlace is set)
	 */
	function renderSupplyMarker(place: Place): void {
		if (!map || !L) {
			return;
		}

		log.debug(`[PlacesRenderer] renderSupplyMarker: Rendering supply marker for place ${place.id} at [${place.lat}, ${place.lon}]`);

		// Remove old supply marker if it exists
		if (supplyMarker) {
			try {
				if (map.hasLayer(supplyMarker)) {
					map.removeLayer(supplyMarker);
				}
			} catch (error) {
				// Marker might already be removed, ignore error
			}
			supplyMarker = null;
		}

		// Create marker for supply place using specialized function
		const marker = createSupplyMarker(place);
		
		// Store place ID in marker options
		if (marker.options) {
			marker.options.placeId = place.id;
			marker.options.isSupplyMarker = true;
		}
		
		// Verify marker coordinates match place coordinates
		const markerLatLng = marker.getLatLng();
		if (Math.abs(markerLatLng.lat - place.lat) > 0.0001 || Math.abs(markerLatLng.lng - place.lon) > 0.0001) {
			log.error(`[PlacesRenderer] ERROR: Supply marker coordinates [${markerLatLng.lat}, ${markerLatLng.lng}] don't match place coordinates [${place.lat}, ${place.lon}]!`);
		}
		
		// Add directly to map (not to cluster)
		marker.addTo(map);
		
		// Track it
		supplyMarker = marker;
		
		log.debug(`[PlacesRenderer] Rendered supply marker for place ${place.id} at [${place.lat}, ${place.lon}]`);
	}
	
	/**
	 * Remove supply marker from map
	 */
	function removeSupplyMarker(): void {
		if (supplyMarker && map) {
			try {
				if (map.hasLayer(supplyMarker)) {
					map.removeLayer(supplyMarker);
				}
			} catch (error) {
				// Marker might already be removed, ignore error
			}
			supplyMarker = null;
			log.debug('[PlacesRenderer] Removed supply marker');
		}
	}
	
	/**
	 * Update supply marker by finding it in currently loaded tiles
	 */
	async function updateSupplyMarkerFromLoadedTiles(): Promise<void> {
		if (!selectedSupplyPlace || !map || !L) {
			return;
		}

		// Check if marker already exists and is correct
		if (supplyMarker) {
			const markerPlaceId = supplyMarker.options?.placeId;
			if (markerPlaceId === selectedSupplyPlace.id) {
				// Marker exists and is correct, just ensure it's on the map
				if (!map.hasLayer(supplyMarker)) {
					log.debug(`[PlacesRenderer] Re-adding supply marker ${selectedSupplyPlace.id} to map`);
					supplyMarker.addTo(map);
				}
				return;
			}
		}

		// Marker doesn't exist or is incorrect, need to find and render it
		try {
			const placesByTile = await getPlacesForVisibleTilesGrouped(visibleTiles, zoom);
			
			for (const places of placesByTile.values()) {
				const supplyPlace = places.find((p) => p.id === selectedSupplyPlace.id);
				if (supplyPlace) {
					log.debug(`[PlacesRenderer] Rendering supply marker for place ${selectedSupplyPlace.id}`);
					removeSupplyMarker();
					renderSupplyMarker(supplyPlace);
					return;
				}
			}
			
			// Supply place not found in visible tiles - might be off-screen
			// If marker exists, keep it (it might be off-screen)
			if (!supplyMarker) {
				log.debug(`[PlacesRenderer] Supply place ${selectedSupplyPlace.id} not found in visible tiles`);
			} else {
				log.debug(`[PlacesRenderer] Supply place ${selectedSupplyPlace.id} not in visible tiles, keeping existing marker`);
			}
		} catch (error) {
			log.error('[PlacesRenderer] Error updating supply marker:', error);
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

		// Prevent concurrent updates
		if (isUpdatingMarkers) {
			log.debug('[PlacesRenderer] Update already in progress, skipping');
			return;
		}

		isUpdatingMarkers = true;

		try {
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

				// Selected marker will be handled by the reactive statement below
				// to avoid duplicate rendering

				const totalMarkers = Array.from(clusterGroupsByTile.values()).reduce(
					(sum, clusterGroup) => sum + clusterGroup.getLayers().length,
					0
				);
				log.debug(
					`[PlacesRenderer] Finished loading. Total markers across ${clusterGroupsByTile.size} tiles: ${totalMarkers}`
				);
			} catch (error) {
				log.error('[PlacesRenderer] Error loading places for new tiles:', error);
			}
		}
		
		isUpdatingMarkers = false;
		
		// Update selected marker after all tiles are loaded (with a delay to ensure everything is ready)
		if (selectedPlaceId) {
			setTimeout(() => {
				updateSelectedMarkerFromLoadedTiles();
			}, 200);
		}
		
		// Update supply marker after all tiles are loaded
		if (selectedSupplyPlace) {
			setTimeout(() => {
				updateSupplyMarkerFromLoadedTiles();
			}, 200);
		}
		} catch (error) {
			log.error('[PlacesRenderer] Error in updateMarkersForTiles:', error);
			isUpdatingMarkers = false;
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
	let lastFilterGood: string | null = null;
	$: {
		const currentFilter = get(placeFilter);
		const currentPlaceId = currentFilter?.selectedPlaceId ?? null;
		const currentGood = currentFilter?.selectedGood ?? null;
		
		// Only reload if filter actually changed (place ID or good)
		const filterChanged = 
			currentPlaceId !== lastFilterPlaceId || 
			currentGood !== lastFilterGood;
		
		if (filterChanged) {
			lastFilterPlaceId = currentPlaceId;
			lastFilterGood = currentGood;
			
			// Always clear supply place and markers when filter is cleared
			if (!currentFilter) {
				clearPlaceRoutes();
				selectedSupplyPlace = null;
				removeSupplyMarker();
				removeSelectedMarker();
			}
			
			if (
				map &&
				L &&
				MarkerClusterGroup &&
				visibleTiles.length > 0 &&
				zoom >= 6
			) {
				// Filter changed - need to reload all currently loaded tiles immediately
				
				// Immediately reload markers with new filter (don't wait for reactive tile update)
				const currentTiles = Array.from(clusterGroupsByTile.keys());
				if (currentTiles.length > 0) {
					// Unload all existing cluster groups
					currentTiles.forEach((tileKey) => {
						unloadTileMarkers(tileKey);
					});
					// Reload with new filter immediately
					updateMarkersForTiles();
				} else {
					// No tiles loaded yet, just load them with the filter
					updateMarkersForTiles();
				}
			} else if (!currentFilter && map && L && MarkerClusterGroup) {
				// Filter cleared but conditions not met - still clean up (already done above)
				// This is redundant but kept for safety
			}
		}
	}
	
	// Ensure routes persist after any marker update (called after updateMarkersForTiles completes)
	$: if (map && L && placeRoutePolylines.length > 0) {
		// Use a small delay to ensure routes are re-added after marker updates
		setTimeout(() => {
			ensureRoutesPersist();
		}, 50);
	}

	// Track selected marker update timeout
	let selectedMarkerUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	
	// Reactive: Update selected marker when selectedPlaceId changes
	$: if (map && L && MarkerClusterGroup && selectedPlaceId !== null && visibleTiles.length > 0 && zoom >= 6) {
		// Clear any pending update
		if (selectedMarkerUpdateTimeout) {
			clearTimeout(selectedMarkerUpdateTimeout);
		}
		
		// Always update selected marker, but debounce to avoid flickering
		selectedMarkerUpdateTimeout = setTimeout(() => {
			updateSelectedMarkerFromLoadedTiles();
		}, 250); // Slightly longer delay to ensure tiles are loaded
	}

	// Reactive: Remove selected marker when selection is cleared
	$: if (selectedPlaceId === null && selectedMarker) {
		removeSelectedMarker();
		selectedSupplyPlace = null;
		removeSupplyMarker();
		clearPlaceRoutes();
	}
	
	// Track supply marker update timeout
	let supplyMarkerUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
	
	// Reactive: Update supply marker when selectedSupplyPlace changes
	$: if (map && L && MarkerClusterGroup && selectedSupplyPlace && visibleTiles.length > 0 && zoom >= 6) {
		// Clear any pending update
		if (supplyMarkerUpdateTimeout) {
			clearTimeout(supplyMarkerUpdateTimeout);
		}
		
		supplyMarkerUpdateTimeout = setTimeout(() => {
			updateSupplyMarkerFromLoadedTiles();
		}, 250);
	}
	
	// Reactive: Remove supply marker when selectedSupplyPlace is cleared
	$: if (!selectedSupplyPlace && supplyMarker) {
		removeSupplyMarker();
	}

	/**
	 * Update selected marker by finding it in currently loaded tiles
	 */
	async function updateSelectedMarkerFromLoadedTiles(): Promise<void> {
		if (!selectedPlaceId || !map || !L) {
			return;
		}

		// Don't render selected marker if it's actually the supply place
		// The supply place is rendered separately via renderSupplyMarker
		if (selectedSupplyPlace && selectedPlaceId === selectedSupplyPlace.id) {
			log.debug(`[PlacesRenderer] Skipping selected marker update - place ${selectedPlaceId} is the supply place`);
			return;
		}

		const currentFilter = get(placeFilter);
		
		// Verify the selected place ID matches the filter
		if (!currentFilter || currentFilter.selectedPlaceId !== selectedPlaceId) {
			// Filter doesn't match, don't render selected marker
			if (selectedMarker) {
				removeSelectedMarker();
			}
			return;
		}

		// Check if marker already exists and is correct - prioritize keeping existing marker
		if (selectedMarker) {
			// Verify it's still the correct marker
			const markerPlaceId = selectedMarker.options?.placeId;
			if (markerPlaceId === selectedPlaceId || currentFilter.selectedPlaceId === selectedPlaceId) {
				// Marker exists and is correct, just ensure it's on the map
				if (!map.hasLayer(selectedMarker)) {
					log.debug(`[PlacesRenderer] Re-adding selected marker ${selectedPlaceId} to map`);
					selectedMarker.addTo(map);
				}
				// Markers are always rendered on top in Leaflet, no need for bringToFront
				return;
			}
		}

		// Marker doesn't exist or is incorrect, need to find and render it
		try {
			const placesByTile = await getPlacesForVisibleTilesGrouped(visibleTiles, zoom);
			
			// Find the selected place directly by ID without filtering
			// The selected place should always be rendered regardless of filter state
			let foundPlace: Place | null = null;
			for (const places of placesByTile.values()) {
				// Search all places, not just filtered ones
				const candidatePlace = places.find((p) => p.id === selectedPlaceId);
				if (candidatePlace) {
					foundPlace = candidatePlace;
					break; // Found it, stop searching
				}
			}
			
			if (foundPlace) {
				// Verify filter still matches before rendering
				const currentFilterCheck = get(placeFilter);
				if (currentFilterCheck && currentFilterCheck.selectedPlaceId === selectedPlaceId) {
					log.debug(`[PlacesRenderer] Found selected place ${selectedPlaceId} at [${foundPlace.lat}, ${foundPlace.lon}], rendering marker`);
					// Double-check we're not accidentally using the supply place
					if (selectedSupplyPlace && foundPlace.id === selectedSupplyPlace.id) {
						log.error(`[PlacesRenderer] ERROR: Found place ${foundPlace.id} matches supply place! This should not happen for selected marker.`);
					}
					removeSelectedMarker();
					renderSelectedMarker(foundPlace);
					return;
				} else {
					log.debug(`[PlacesRenderer] Filter doesn't match for place ${selectedPlaceId}, not rendering`);
				}
			}
			
			// Selected place not found in visible tiles - might be off-screen
			// If marker exists, keep it (it might be off-screen)
			if (!selectedMarker) {
				log.debug(`[PlacesRenderer] Selected place ${selectedPlaceId} not found in visible tiles`);
			} else {
				// Keep existing marker even if not in visible tiles (it might be off-screen)
				log.debug(`[PlacesRenderer] Selected place ${selectedPlaceId} not in visible tiles, keeping existing marker`);
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
	 * Routes are stored separately from markers and should not be cleared on pan/zoom or tile loading
	 */
	function ensureRoutesPersist(): void {
		if (!map || !L) return;
		
		// Filter out any null/undefined polylines
		placeRoutePolylines = placeRoutePolylines.filter((polyline) => polyline !== null && polyline !== undefined);
		
		// Re-add routes to map if they were accidentally removed
		// This happens after tile loading/unloading operations
		placeRoutePolylines.forEach((polyline) => {
			if (polyline) {
				// Check if polyline is still valid (hasn't been destroyed)
				try {
					if (map && !map.hasLayer(polyline)) {
						log.debug('[PlacesRenderer] Re-adding route polyline to map');
						polyline.addTo(map);
						polyline.bringToFront(); // Ensure routes are visible above markers
					} else if (map && map.hasLayer(polyline)) {
						// Ensure route stays on top even if already on map
						polyline.bringToFront();
					}
				} catch (error) {
					// Polyline might have been destroyed, remove from array
					log.debug('[PlacesRenderer] Route polyline no longer valid, removing from array');
					const index = placeRoutePolylines.indexOf(polyline);
					if (index > -1) {
						placeRoutePolylines.splice(index, 1);
					}
				}
			}
		});
	}

	onDestroy(() => {
		// Clear update timeouts
		if (updateTimeout) {
			clearTimeout(updateTimeout);
			updateTimeout = null;
		}
		if (selectedMarkerUpdateTimeout) {
			clearTimeout(selectedMarkerUpdateTimeout);
			selectedMarkerUpdateTimeout = null;
		}
		if (supplyMarkerUpdateTimeout) {
			clearTimeout(supplyMarkerUpdateTimeout);
			supplyMarkerUpdateTimeout = null;
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
		
		// Clean up supply marker
		removeSupplyMarker();
		
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
