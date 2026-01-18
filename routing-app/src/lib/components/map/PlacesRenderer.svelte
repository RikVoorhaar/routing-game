<script lang="ts">
	import { onDestroy } from 'svelte';
	import { getPlacesForVisibleTilesGrouped } from '$lib/map/placesGetter';
	import { limitPlaces, type PlaceFilterPredicate } from '$lib/map/placesLimiter';
	import { createPlacePopupHTML } from './popups/placePopup';
	import type { Place } from '$lib/stores/placesCache';
	import { log } from '$lib/logger';

	export let map: any;
	export let L: any;
	export let visibleTiles: string[] = [];
	export let zoom: number = 0;
	export let filterPredicate: PlaceFilterPredicate<Place> = () => true;
	export let selectedPlaceId: number | null = null;

	const PLACES_PER_TILE_LIMIT = 20;

	let placeMarkers: Map<number, any> = new Map(); // Track markers by place ID

	/**
	 * Clear all place markers from the map
	 */
	function clearPlaces(): void {
		log.info(`[PlacesRenderer] Clearing ${placeMarkers.size} place markers`);
		placeMarkers.forEach((marker) => {
			if (marker && map.hasLayer(marker)) {
				map.removeLayer(marker);
			}
		});
		placeMarkers.clear();
	}

	/**
	 * Render places as markers on the map
	 */
	async function renderPlaces(): Promise<void> {
		if (!map || !L || zoom < 8 || visibleTiles.length === 0) {
			log.info('[PlacesRenderer] Skipping render - conditions not met', {
				hasMap: !!map,
				hasL: !!L,
				zoom,
				visibleTileCount: visibleTiles.length
			});
			return;
		}

		log.info(`[PlacesRenderer] Rendering places for ${visibleTiles.length} visible tiles at zoom ${zoom}`);

		// Clear existing markers
		clearPlaces();

		try {
			// Get places grouped by visible tile
			const placesByTile = await getPlacesForVisibleTilesGrouped(visibleTiles, zoom);

			if (placesByTile.size === 0) {
				log.info('[PlacesRenderer] No places found for visible tiles');
				return;
			}

			let totalPlaces = 0;
			let totalFiltered = 0;
			let totalLimited = 0;

			// Process each visible tile separately
			for (const [tileKey, tilePlaces] of placesByTile.entries()) {
				if (tilePlaces.length === 0) {
					continue;
				}

				totalPlaces += tilePlaces.length;

				// Apply filter to places in this tile
				const filteredPlaces = tilePlaces.filter(filterPredicate);
				totalFiltered += filteredPlaces.length;

				// Limit to 20 places per tile
				const limitedPlaces = limitPlaces(filteredPlaces, () => true, PLACES_PER_TILE_LIMIT);
				totalLimited += limitedPlaces.length;

				log.debug(
					`[PlacesRenderer] Tile ${tileKey}: ${tilePlaces.length} places -> ${filteredPlaces.length} filtered -> ${limitedPlaces.length} limited`
				);

				// Create markers for each place in this tile
				limitedPlaces.forEach((place) => {
					try {
						// Use standard Leaflet default marker icon
						const marker = L.marker([place.lat, place.lon], {
							icon: L.icon({
								iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
								iconRetinaUrl:
									'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
								shadowUrl:
									'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
								iconSize: [25, 41],
								iconAnchor: [12, 41],
								popupAnchor: [1, -34],
								tooltipAnchor: [16, -28],
								shadowSize: [41, 41]
							}),
							title: `${place.category} (${place.id})`
						}).addTo(map);

						// Create popup
						const popupContent = createPlacePopupHTML(place);
						const popup = L.popup({
							maxWidth: 250,
							className: 'place-tooltip-popup'
						}).setContent(popupContent);

						marker.bindPopup(popup);

						// Store marker by place ID
						placeMarkers.set(place.id, marker);
					} catch (error) {
						log.warn(`[PlacesRenderer] Failed to create marker for place ${place.id}:`, error);
					}
				});
			}

			log.info(
				`[PlacesRenderer] Created ${placeMarkers.size} place markers (${totalPlaces} total -> ${totalFiltered} filtered -> ${totalLimited} limited across ${placesByTile.size} tiles)`
			);
		} catch (error) {
			log.error('[PlacesRenderer] Error rendering places:', error);
		}
	}

	/**
	 * Update markers when filter or selection changes
	 */
	function updateMarkers(): void {
		renderPlaces();
	}

	// Reactive: Update markers when visible tiles, zoom, or filter changes
	$: if (map && L && visibleTiles.length > 0 && zoom >= 8) {
		renderPlaces();
	}

	// Reactive: Update markers when filter predicate changes
	$: if (map && L) {
		updateMarkers();
	}

	// Reactive: Update markers when selected place changes (for future use)
	$: if (map && L && selectedPlaceId !== null) {
		// Future: filter to show only related places
		updateMarkers();
	}

	onDestroy(() => {
		clearPlaces();
	});
</script>
