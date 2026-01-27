<script lang="ts">
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const defaultCenter: [number, number] = [5.1214, 52.0907];
	const defaultZoom = 13;

	// OSM raster basemap matching the Leaflet implementation
	const baseStyle = {
		version: 8 as const,
		sources: {
			osm: {
				type: 'raster' as const,
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
				attribution: '© OpenStreetMap contributors',
				maxzoom: 17
			}
		},
		layers: [
			{
				id: 'osm',
				type: 'raster' as const,
				source: 'osm'
			}
		]
	};

	// Martin TileJSON URL for the places table (Martin catalog uses table name as source id)
	const martinPlacesUrl = `${getTileServerUrl()}/places`;
</script>

<div class="h-full w-full min-h-[400px]">
	<MapLibre
		style={baseStyle}
		center={defaultCenter}
		zoom={defaultZoom}
		class="h-full w-full"
		autoloadGlobalCss={true}
	>
		<VectorTileSource id="martin-places" url={martinPlacesUrl}>
			<CircleLayer
				id="places-circles"
				sourceLayer="places"
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
