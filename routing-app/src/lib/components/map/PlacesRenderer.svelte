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

			log.info('[PlacesRenderer] MarkerClusterGroup class initialized');
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
		const gameState = get(currentGameState);
		if (gameState?.seed && currentConfig) {
			const categoryGoods = currentConfig.categories.find((cat) => cat.name === place.category);
			if (categoryGoods) {
				selectedGoods = selectPlaceGoods(gameState.seed, place.id, categoryGoods);
			}
		}

		// Create popup with selected goods
		const popupContent = createPlacePopupHTML(place, currentConfig, selectedGoods);
		const popup = L.popup({
			maxWidth: 250,
			className: 'place-tooltip-popup'
		}).setContent(popupContent);

		marker.bindPopup(popup);

		// Add click handler to set/clear filter
		marker.on('click', () => {
			const currentFilter = get(placeFilter);
			
			// If filter is already set for this place, clear it (toggle behavior)
			if (currentFilter && currentFilter.selectedPlaceId === place.id) {
				placeFilter.set(null);
				return;
			}
			
			// If we have selected goods, set the filter
			if (selectedGoods) {
				const filter: PlaceFilter = {
					selectedPlaceId: place.id,
					selectedGood: selectedGoods.good,
					filterType: selectedGoods.type,
					targetType: selectedGoods.type === 'supply' ? 'demand' : 'supply'
				};
				placeFilter.set(filter);
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
		if (selectedPlace) {
			renderSelectedMarker(selectedPlace);
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
			map.removeLayer(selectedMarker);
			selectedMarker = null;
		}

		// Create marker for selected place
		const marker = createMarker(place);
		
		// Add directly to map (not to cluster)
		marker.addTo(map);
		
		// Track it
		selectedMarker = marker;
		
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
			log.info('[PlacesRenderer] Skipping update - conditions not met', {
				hasMap: !!map,
				hasL: !!L,
				zoom,
				visibleTileCount: visibleTiles.length
			});
			return;
		}

		// Ensure MarkerClusterGroup is initialized
		if (!MarkerClusterGroup) {
			await initMarkerClusterClass();
			if (!MarkerClusterGroup) {
				log.error('[PlacesRenderer] Failed to initialize MarkerClusterGroup, cannot update markers');
				return;
			}
		}

		log.info(`[PlacesRenderer] Updating markers for ${visibleTiles.length} visible tiles at zoom ${zoom}`);

		// Get currently loaded tiles (keys of clusterGroupsByTile)
		const loadedTiles = new Set(clusterGroupsByTile.keys());

		// Get current visible tiles as a set
		const visibleTilesSet = new Set(visibleTiles);

		// Find tiles to remove (loaded but not visible)
		const tilesToRemove = Array.from(loadedTiles).filter((tile) => !visibleTilesSet.has(tile));

		// Find tiles to add (visible but not loaded)
		const tilesToAdd = visibleTiles.filter((tile) => !loadedTiles.has(tile));

		log.info(
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
				log.info(
					`[PlacesRenderer] Finished loading. Total markers across ${clusterGroupsByTile.size} tiles: ${totalMarkers}`
				);
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
			log.info('[PlacesRenderer] Place goods config loaded');
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

	// Reactive: Update markers when visible tiles, zoom changes (initial load)
	$: if (map && L && MarkerClusterGroup && visibleTiles.length > 0 && zoom >= 6) {
		updateMarkersForTiles();
	}

	// Reactive: Update markers when filter changes (reload all currently loaded tiles)
	// Track selectedPlaceId to detect filter changes - this will reload markers when filter is set/cleared
	$: if (
		map &&
		L &&
		MarkerClusterGroup &&
		clusterGroupsByTile.size > 0 &&
		visibleTiles.length > 0 &&
		zoom >= 6 &&
		selectedPlaceId !== undefined
	) {
		// Filter changed - need to reload all currently loaded tiles
		// Remove selected marker first (it will be re-added if still selected)
		removeSelectedMarker();
		
		const currentTiles = Array.from(clusterGroupsByTile.keys());
		// Unload all existing cluster groups
		currentTiles.forEach((tileKey) => {
			unloadTileMarkers(tileKey);
		});
		// Reload with new filter
		updateMarkersForTiles();
	}

	// Reactive: Update selected marker when selectedPlaceId changes
	$: if (map && L && MarkerClusterGroup && selectedPlaceId !== null && visibleTiles.length > 0 && zoom >= 6) {
		// Selected place changed - find and render it
		updateSelectedMarkerFromLoadedTiles();
	}

	// Reactive: Remove selected marker when selection is cleared
	$: if (selectedPlaceId === null && selectedMarker) {
		removeSelectedMarker();
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

	onDestroy(() => {
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
