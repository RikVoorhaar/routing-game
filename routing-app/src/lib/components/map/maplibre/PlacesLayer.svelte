<script lang="ts">
	import { VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { placeFilter } from '$lib/stores/placeFilter';

	export let tileServerUrl: string;

	// Note: Full supply/demand/good type filtering requires client-side computation
	// and will be implemented in Step 5. The placeFilter store is imported here
	// to set up the structure for future filtering implementation.

	// URL for enhanced active places view
	// Martin is configured with minzoom: 8, so it won't serve tiles below zoom 8
	const martinActivePlacesUrl = `${tileServerUrl}/enhanced_active_places_with_geom`;
</script>

<VectorTileSource id="martin-active-places" url={martinActivePlacesUrl}>
	<CircleLayer
		id="active-places-circles"
		sourceLayer="enhanced_active_places_with_geom"
		paint={{
			'circle-radius': 3,
			'circle-color': '#2563eb',
			'circle-stroke-width': 1,
			'circle-stroke-color': '#fff'
		}}
	/>
</VectorTileSource>
