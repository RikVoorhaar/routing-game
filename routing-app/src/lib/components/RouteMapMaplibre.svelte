<script lang="ts">
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const defaultCenter: [number, number] = [5.1214, 52.0907];
	const defaultZoom = 13;

	// Martin function source (lines only; polygons dropped in UI). Style per tiles-plan §4.1.
	const tileServerUrl = getTileServerUrl();
	const baseStyle = {
		version: 8 as const,
		sources: {
			europe_lines: {
				type: 'vector' as const,
				url: `${tileServerUrl}/europe_lines`,
				maxzoom: 15
			}
		},
		layers: [
			{
				id: 'roads',
				type: 'line' as const,
				source: 'europe_lines',
				'source-layer': 'europe_lines',
				filter: ['has', 'highway'],
				paint: {
					'line-color': [
						'match',
						['get', 'highway'],
						'motorway',
						'#e892a2',
						'motorway_link',
						'#e892a2',
						'trunk',
						'#f2b3a3',
						'trunk_link',
						'#f2b3a3',
						'primary',
						'#f2d29b',
						'primary_link',
						'#f2d29b',
						'secondary',
						'#ffffff',
						'secondary_link',
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
