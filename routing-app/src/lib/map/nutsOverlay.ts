import type { FeatureCollection } from 'geojson';
import { NUTS_LEVEL, NUTS_HOVER_MAX_ZOOM } from '$lib/stores/regionOverlay';
import { log } from '$lib/logger';

/**
 * Cached GeoJSON data (loaded once, reused)
 */
let cachedGeoJson: FeatureCollection | null = null;

/**
 * Load NUTS GeoJSON from static assets
 * Caches the result for subsequent calls
 */
export async function loadNutsGeoJson(): Promise<FeatureCollection> {
	if (cachedGeoJson) {
		return cachedGeoJson;
	}

	try {
		// Use combined file that includes UK regions from 2021
		const response = await fetch('/regions/NUTS_RG_60M_2024_3857.geojson');
		if (!response.ok) {
			throw new Error(`Failed to fetch NUTS GeoJSON: ${response.statusText}`);
		}
		cachedGeoJson = await response.json();
		log.info('[NutsOverlay] Loaded NUTS GeoJSON (2024 + UK 2021)');
		return cachedGeoJson;
	} catch (error) {
		log.error('[NutsOverlay] Failed to load NUTS GeoJSON:', error);
		throw error;
	}
}

/**
 * Convert EPSG:3857 coordinates to Leaflet GeoJSON format [lng, lat]
 * EPSG:3857 uses meters, Leaflet GeoJSON expects [lng, lat] in degrees
 */
function coordsToLatLng(coords: [number, number], L: any): [number, number] {
	// EPSG:3857 coordinates are in meters
	// Use Leaflet's CRS to unproject from Web Mercator to lat/lng
	const point = L.point(coords[0], coords[1]);
	const latLng = L.CRS.EPSG3857.unproject(point);
	// GeoJSON format is [longitude, latitude]
	return [latLng.lng, latLng.lat];
}

/**
 * Convert GeoJSON coordinates from EPSG:3857 to Leaflet LatLng format
 * Handles nested coordinate arrays (Polygon, MultiPolygon, etc.)
 */
function convertCoordinates(coords: any[], L: any): any {
	if (typeof coords[0] === 'number') {
		// Point: [x, y] -> [lat, lng]
		return coordsToLatLng(coords as [number, number], L);
	} else {
		// Array of coordinates: recursively convert
		return coords.map((coord) => convertCoordinates(coord, L));
	}
}

/**
 * Transform a GeoJSON feature's geometry coordinates from EPSG:3857 to WGS84 (lat/lng)
 */
function transformFeatureGeometry(feature: any, L: any): any {
	const geometry = feature.geometry;
	if (!geometry || !geometry.coordinates) {
		return feature;
	}

	const transformedFeature = {
		...feature,
		geometry: {
			...geometry,
			coordinates: convertCoordinates(geometry.coordinates, L)
		}
	};

	return transformedFeature;
}

/**
 * Default style for NUTS regions
 */
const defaultStyle = {
	color: '#3b82f6', // Blue border
	weight: 1,
	opacity: 0.6,
	fillColor: '#3b82f6',
	fillOpacity: 0.1
};

/**
 * Highlight style for hover
 */
const highlightStyle = {
	color: '#2563eb', // Darker blue border
	weight: 2,
	opacity: 0.8,
	fillColor: '#3b82f6',
	fillOpacity: 0.2
};

/**
 * Create a Leaflet GeoJSON layer for NUTS regions
 * Filters to NUTS level 2 and handles EPSG:3857 projection conversion
 */
export function createNutsLayer(
	L: any,
	geojson: FeatureCollection,
	options: {
		onMouseOver?: (e: any) => void;
		onMouseOut?: (e: any) => void;
	} = {}
): any {
	// Filter to NUTS level 2 and transform coordinates from EPSG:3857 to WGS84
	const filteredFeatures = geojson.features
		.filter((feature) => feature.properties?.LEVL_CODE === NUTS_LEVEL)
		.map((feature) => transformFeatureGeometry(feature, L));

	const filteredGeoJson: FeatureCollection = {
		type: 'FeatureCollection',
		features: filteredFeatures
	};

	// Create GeoJSON layer (coordinates are already converted to lat/lng)
	const layer = L.geoJSON(filteredGeoJson, {
		style: defaultStyle,
		onEachFeature: (feature: any, layer: any) => {
			// Set tooltip content from NUTS_NAME or NAME_LATN
			const regionName =
				feature.properties?.NUTS_NAME || feature.properties?.NAME_LATN || 'Unknown';
			layer.bindTooltip(regionName, {
				permanent: false,
				direction: 'auto',
				className: 'nuts-tooltip'
			});

			// Mouse event handlers for hover highlight
			layer.on({
				mouseover: (e: any) => {
					const targetLayer = e.target;
					targetLayer.setStyle(highlightStyle);
					if (options.onMouseOver) {
						options.onMouseOver(e);
					}
				},
				mouseout: (e: any) => {
					const targetLayer = e.target;
					targetLayer.setStyle(defaultStyle);
					if (options.onMouseOut) {
						options.onMouseOut(e);
					}
				}
			});
		}
	});

	return layer;
}

/**
 * Set interactivity for NUTS layer based on current zoom level
 * Enables/disables hover highlight and tooltip based on zoom threshold
 */
export function setNutsInteractivity(options: {
	map: any;
	layer: any;
	enabled: boolean;
	hoverMaxZoom: number;
}): void {
	const { map, layer, enabled, hoverMaxZoom } = options;

	if (!map || !layer) return;

	const currentZoom = map.getZoom();
	const shouldBeInteractive = enabled && currentZoom <= hoverMaxZoom;

	// Iterate through all layers in the GeoJSON group
	layer.eachLayer((featureLayer: any) => {
		if (shouldBeInteractive) {
			// Enable interactivity: restore event handlers and tooltip
			featureLayer.options.interactive = true;
			featureLayer.options.bubblingMouseEvents = true;
			if (featureLayer._tooltip) {
				featureLayer._tooltip.options.permanent = false;
			}
		} else {
			// Disable interactivity: remove event handlers and hide tooltip
			featureLayer.options.interactive = false;
			featureLayer.options.bubblingMouseEvents = false;
			if (featureLayer._tooltip) {
				featureLayer._tooltip.options.permanent = true;
				featureLayer._tooltip.hide();
			}
			// Reset to default style when disabling
			featureLayer.setStyle(defaultStyle);
		}
	});
}
