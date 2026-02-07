<script lang="ts">
	import { onMount } from 'svelte';
	import { GeoJSONSource, FillLayer, LineLayer } from 'svelte-maplibre-gl';
	import { regionOverlayEnabled, NUTS_HOVER_MAX_ZOOM } from '$lib/stores/regionOverlay';
	import { getRegionsGeoJson, setRegionsGeoJson } from '$lib/stores/regionsCache';
	import { log } from '$lib/logger';
	import type { FeatureCollection } from 'geojson';

	// Regions GeoJSON data
	let regionsGeoJson: FeatureCollection = {
		type: 'FeatureCollection',
		features: []
	};

	// Track loading state
	let isLoading = false;
	let loadError: string | null = null;

	/**
	 * Load regions GeoJSON from cache or API
	 */
	async function loadRegions() {
		if (isLoading) return;
		isLoading = true;
		loadError = null;

		try {
			// Check IndexedDB cache first
			const cached = await getRegionsGeoJson();
			if (cached) {
				regionsGeoJson = cached;
				log.info('[RegionBorders] Loaded regions from IndexedDB cache');
				isLoading = false;
				return;
			}

			// Cache miss - fetch from API
			log.info('[RegionBorders] Cache miss, fetching regions from API');
			const response = await fetch('/api/regions/geojson');
			if (!response.ok) {
				throw new Error(`Failed to fetch regions: ${response.statusText}`);
			}

			const geojson = await response.json();
			regionsGeoJson = geojson;

			// Store in IndexedDB cache
			await setRegionsGeoJson(geojson);
			log.info('[RegionBorders] Loaded regions from API and cached in IndexedDB');
		} catch (error) {
			log.error('[RegionBorders] Failed to load regions:', error);
			loadError = error instanceof Error ? error.message : 'Unknown error';
		} finally {
			isLoading = false;
		}
	}

	// Load regions on mount
	onMount(() => {
		loadRegions();
	});

	// Compute layer visibility based on regionOverlayEnabled
	$: layerVisibility = $regionOverlayEnabled ? 'visible' : 'none';
</script>

{#if isLoading}
	<!-- Loading state - regions will appear when loaded -->
{:else if loadError}
	<!-- Error state - silently fail, regions won't be displayed -->
	<!-- log.error already logged the error -->
{:else if regionsGeoJson.features.length > 0}
	<GeoJSONSource id="regions-geojson" data={regionsGeoJson}>
		<!-- Fill layer for region polygons -->
		<FillLayer
			id="regions-fill"
			layout={{
				visibility: layerVisibility
			}}
			paint={{
				'fill-color': '#3b82f6',
				'fill-opacity': 0.1
			}}
		/>
		<!-- Line layer for region borders -->
		<LineLayer
			id="regions-lines"
			layout={{
				visibility: layerVisibility
			}}
			paint={{
				'line-color': '#3b82f6',
				'line-width': 1,
				'line-opacity': 0.6
			}}
		/>
	</GeoJSONSource>
{/if}
