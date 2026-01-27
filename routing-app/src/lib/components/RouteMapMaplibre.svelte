<script lang="ts">
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const defaultCenter: [number, number] = [5.1214, 52.0907];
	const defaultZoom = 13;

	// All tile sources from Martin only (no OSM raster): commercial licensing + client-side styling.
	const tileServerUrl = getTileServerUrl();
	const baseStyle = {
		version: 8 as const,
		sources: {
			martin_roads: {
				type: 'vector' as const,
				url: `${tileServerUrl}/europe_planet_osm_roads`
			},
			martin_polygon: {
				type: 'vector' as const,
				url: `${tileServerUrl}/europe_planet_osm_polygon`
			}
		},
		layers: [
			{
				id: 'polygon-fill',
				type: 'fill' as const,
				source: 'martin_polygon',
				'source-layer': 'europe_planet_osm_polygon',
				paint: {
					'fill-color': '#e8e8e8',
					'fill-outline-color': '#c0c0c0'
				}
			},
			{
				id: 'roads-line',
				type: 'line' as const,
				source: 'martin_roads',
				'source-layer': 'europe_planet_osm_roads',
				paint: {
					'line-color': '#888',
					'line-width': 1
				}
			}
		]
	};

	const martinActivePlacesUrl = `${tileServerUrl}/active_places_with_geom`;
</script>

<div class="h-full w-full min-h-[400px]">
	<MapLibre
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
