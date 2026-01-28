<script lang="ts">
	import { MapLibre, VectorTileSource, CircleLayer } from 'svelte-maplibre-gl';
	import { getTileServerUrl } from '$lib/map/tileServerUrl';

	// Same default view as Leaflet MapManager (Utrecht, zoom 13). MapLibre uses [lng, lat].
	const defaultCenter: [number, number] = [5.1214, 52.0907];
	const defaultZoom = 13;

	// Europe basemap: Planetiler MBTiles (OpenMapTiles schema) via Martin. Overlay: PostGIS active_places.
	const tileServerUrl = getTileServerUrl();
	const baseStyle = {
		version: 8 as const,
		sources: {
			europe: {
				type: 'vector' as const,
				url: `${tileServerUrl}/europe`,
				maxzoom: 15,
				attribution: '© <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
			}
		},
		layers: [
			{ id: 'background', type: 'background' as const, paint: { 'background-color': '#f8f4f0' } },
			{
				id: 'water',
				type: 'fill' as const,
				source: 'europe',
				'source-layer': 'water',
				filter: ['==', ['get', 'natural'], 'water'],
				paint: { 'fill-color': '#aad3df' }
			},
			{
				id: 'landuse',
				type: 'fill' as const,
				source: 'europe',
				'source-layer': 'landuse',
				filter: ['in', ['get', 'landuse'], ['literal', ['forest', 'grass', 'park']]],
				paint: {
					'fill-color': [
						'match',
						['get', 'landuse'],
						'forest',
						'#cdebb0',
						'grass',
						'#e5f5c0',
						'park',
						'#c8e6a0',
						'#eaeaea'
					]
				}
			},
			{
				id: 'transportation',
				type: 'line' as const,
				source: 'europe',
				'source-layer': 'transportation',
				filter: ['has', 'class'],
				paint: {
					'line-color': [
						'match',
						['get', 'class'],
						'motorway',
						'#e892a2',
						'trunk',
						'#f2b3a3',
						'primary',
						'#f2d29b',
						'secondary',
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
