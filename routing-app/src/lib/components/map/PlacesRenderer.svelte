<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getPlacesForVisibleTilesGrouped } from '$lib/map/placesGetter';
	import type { PlaceFilterPredicate } from '$lib/map/placesLimiter';
	import { createPlacePopupHTML } from './popups/placePopup';
	import type { Place } from '$lib/stores/placesCache';
	import { log } from '$lib/logger';
	import { placeGoods } from '$lib/stores/placeGoods';
	import { get } from 'svelte/store';
	import type { PlaceGoodsConfig } from '$lib/config/placeGoodsTypes';

	export let map: any;
	export let L: any;
	export let visibleTiles: string[] = [];
	export let zoom: number = 0;
	export let filterPredicate: PlaceFilterPredicate<Place> = () => true;
	export let selectedPlaceId: number | null = null;

	let MarkerClusterGroup: any = null;
	let clusterGroupsByTile: Map<string, any> = new Map();
	let defaultIcon: any = null; // Cached marker icon
	let placeGoodsConfig: PlaceGoodsConfig | null = null;

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
		const marker = L.marker([place.lat, place.lon], {
			icon: defaultIcon,
			title: `${place.category} (${place.id})`
		});

		// Get current place goods config from store
		const currentConfig = get(placeGoods) || placeGoodsConfig;

		// Create popup
		const popupContent = createPlacePopupHTML(place, currentConfig);
		const popup = L.popup({
			maxWidth: 250,
			className: 'place-tooltip-popup'
		}).setContent(popupContent);

		marker.bindPopup(popup);

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

		if (filteredPlaces.length === 0) {
			log.debug(`[PlacesRenderer] No filtered places for tile ${tileKey}`);
			return;
		}

		log.debug(`[PlacesRenderer] Loading ${filteredPlaces.length} markers for tile ${tileKey}`);

		// Create markers array
		const markers = filteredPlaces.map((place) => createMarker(place));

		// Create cluster group for this tile
		const clusterGroup = new MarkerClusterGroup(getClusterOptions());

		// Add markers in batch using addLayers
		clusterGroup.addLayers(markers);

		// Add cluster group to map
		clusterGroup.addTo(map);

		// Track it
		clusterGroupsByTile.set(tileKey, clusterGroup);

		log.debug(`[PlacesRenderer] Created cluster group for tile ${tileKey} with ${markers.length} markers`);
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

	// Reactive: Update markers when visible tiles, zoom, or filter changes
	$: if (map && L && MarkerClusterGroup && visibleTiles.length > 0 && zoom >= 6) {
		updateMarkersForTiles();
	}

	// Reactive: Update markers when filter predicate changes
	$: if (map && L && MarkerClusterGroup && clusterGroupsByTile.size > 0) {
		// Filter changed - need to reload all tiles
		const currentTiles = Array.from(clusterGroupsByTile.keys());
		// Unload all existing cluster groups
		currentTiles.forEach((tileKey) => {
			unloadTileMarkers(tileKey);
		});
		// Reload with new filter
		updateMarkersForTiles();
	}

	// Reactive: Update markers when selected place changes (for future use)
	$: if (map && L && MarkerClusterGroup && selectedPlaceId !== null) {
		// Future: filter to show only related places
		// For now, just trigger update
		updateMarkersForTiles();
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
