<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { VectorTileSource, CircleLayer, SymbolLayer, GeoJSONSource } from 'svelte-maplibre-gl';
	import { placeFilter } from '$lib/stores/placeFilter';
	import { placeGoods } from '$lib/stores/placeGoods';
	import { currentGameState } from '$lib/stores/gameData';
	import { selectPlaceGoods } from '$lib/places/placeGoodsSelection';
	import { getGoodsIconName } from '$lib/places/goodsIconMapping';
	import type { Map as MapLibreMap, Feature, MapDataEvent } from 'maplibre-gl';
	import type { GeoJSONSource as GeoJSONSourceType } from 'maplibre-gl';
	import { get } from 'svelte/store';
	import { log } from '$lib/logger';
	import type { PlaceCategoryGoods } from '$lib/config/placeGoodsTypes';
	import type { FeatureCollection, Point, GeoJsonProperties } from 'geojson';

	export let tileServerUrl: string;
	export let mapInstance: MapLibreMap | undefined = undefined;

	// URL for enhanced active places view
	// Martin is configured with minzoom: 8, so it won't serve tiles below zoom 8
	const martinActivePlacesUrl = `${tileServerUrl}/enhanced_active_places_with_geom`;

	// Cache for computed supply/demand and good type per placeId + seed
	const computedPropertiesCache = new Map<string, { type: 'supply' | 'demand'; good: string; iconName: string | null }>();

	// GeoJSON source data
	let placesGeoJSON: FeatureCollection<Point, GeoJsonProperties> = {
		type: 'FeatureCollection',
		features: []
	};

	// Track if icons are loaded
	let iconsLoaded = false;
	const loadedIcons = new Set<string>();

	// Preload all required icons on mount (both supply and demand versions)
	async function preloadAllIcons() {
		if (!mapInstance || iconsLoaded) return;

		const allBaseIconNames = [
			'fa-person',
			'fa-basket-shopping',
			'fa-pizza-slice',
			'fa-microchip',
			'fa-spray-can-sparkles',
			'fa-box-open',
			'fa-seedling',
			'fa-gas-pump',
			'fa-car-side',
			'fa-capsules',
			'fa-carrot',
			'fa-smog',
			'fa-gem',
			'fa-pallet',
			'fa-gears',
			'fa-flask',
			'fa-cow'
		];

		const iconLoads: Promise<void>[] = [];
		
		// Load both supply (green) and demand (red) versions of each icon
		// Using darker colors for better contrast
		for (const baseIconName of allBaseIconNames) {
			iconLoads.push(loadFontAwesomeIcon(mapInstance!, `${baseIconName}-supply`, '#16a34a')); // dark green
			iconLoads.push(loadFontAwesomeIcon(mapInstance!, `${baseIconName}-demand`, '#dc2626')); // dark red
		}

		// Load all icons in parallel
		await Promise.all(iconLoads);
		iconsLoaded = true;
	}

	// Cache key generator
	function getCacheKey(placeId: number, seed: number): string {
		return `${placeId}:${seed}`;
	}

	/**
	 * Load Font Awesome SVG icon with color and add to MapLibre sprite sheet
	 * Creates colored versions of icons by modifying SVG fill color
	 */
	async function loadFontAwesomeIcon(map: MapLibreMap, iconName: string, color: string): Promise<void> {
		if (loadedIcons.has(iconName)) {
			return; // Already loaded
		}

		// Check if image already exists in map (in case it was added elsewhere)
		if (map.hasImage(iconName)) {
			loadedIcons.add(iconName);
			return;
		}

		try {
			// Extract base icon name (remove -supply or -demand suffix)
			const baseIconName = iconName.replace(/-supply$|-demand$/, '');
			const iconPath = baseIconName.replace('fa-', '');
			
			// Use local SVG files from static directory
			const iconUrl = `/icons/fontawesome/${iconPath}.svg`;

			// Load SVG
			const response = await fetch(iconUrl);
			if (!response.ok) {
				log.warn(`[PlacesLayer] Failed to load Font Awesome icon ${iconName} from ${iconUrl}: ${response.statusText}`);
				return;
			}

			let svgText = await response.text();
			
			// Create black version for border (before modifying color)
			const originalSvgText = svgText;
			const blackSvgText = originalSvgText.replace(/fill="[^"]*"/g, 'fill="#000000"').replace(/fill='[^']*'/g, "fill='#000000'");
			const blackSvgBlob = new Blob([blackSvgText], { type: 'image/svg+xml' });
			const blackSvgDataUrl = URL.createObjectURL(blackSvgBlob);
			
			// Replace fill with the desired color for colored version
			svgText = svgText.replace(/fill="[^"]*"/g, `fill="${color}"`);
			svgText = svgText.replace(/fill='[^']*'/g, `fill='${color}'`);
			// Also handle stroke if present
			svgText = svgText.replace(/stroke="[^"]*"/g, `stroke="${color}"`);
			svgText = svgText.replace(/stroke='[^']*'/g, `stroke='${color}'`);
			
			// Create data URL from colored SVG
			const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
			const svgDataUrl = URL.createObjectURL(svgBlob);
			
			// Load both black (for border) and colored versions
			const blackImg = new Image();
			const coloredImg = new Image();
			
			await new Promise<void>((resolve, reject) => {
				let blackLoaded = false;
				let coloredLoaded = false;
				
				const tryRender = () => {
					if (!blackLoaded || !coloredLoaded) return;
					
					try {
						// Create canvas to render SVG at desired size
						const canvas = document.createElement('canvas');
						const size = 32; // Icon size in pixels (2x for better quality)
						canvas.width = size;
						canvas.height = size;
						const ctx = canvas.getContext('2d');
						if (!ctx) {
							reject(new Error('Failed to get canvas context'));
							return;
						}
						
						// Enable image smoothing for better quality
						ctx.imageSmoothingEnabled = true;
						ctx.imageSmoothingQuality = 'high';
						
						// Draw black version slightly larger for border (15% larger)
						const borderScale = 1.15;
						const borderSize = size * borderScale;
						const borderOffset = (borderSize - size) / 2;
						ctx.drawImage(blackImg, -borderOffset, -borderOffset, borderSize, borderSize);
						
						// Draw colored icon on top (centered)
						ctx.drawImage(coloredImg, 0, 0, size, size);
						
						// Convert canvas to ImageBitmap for better compatibility
						createImageBitmap(canvas)
							.then((imageBitmap) => {
								map.addImage(iconName, imageBitmap);
								loadedIcons.add(iconName);
								URL.revokeObjectURL(svgDataUrl);
								URL.revokeObjectURL(blackSvgDataUrl);
								resolve();
							})
							.catch((error) => {
								URL.revokeObjectURL(svgDataUrl);
								URL.revokeObjectURL(blackSvgDataUrl);
								reject(error);
							});
					} catch (error) {
						URL.revokeObjectURL(svgDataUrl);
						URL.revokeObjectURL(blackSvgDataUrl);
						reject(error);
					}
				};
				
				blackImg.onload = () => {
					blackLoaded = true;
					tryRender();
				};
				blackImg.onerror = () => {
					URL.revokeObjectURL(blackSvgDataUrl);
					reject(new Error(`Failed to load black version for ${iconName}`));
				};
				
				coloredImg.onload = () => {
					coloredLoaded = true;
					tryRender();
				};
				coloredImg.onerror = () => {
					URL.revokeObjectURL(svgDataUrl);
					reject(new Error(`Failed to load colored version for ${iconName}`));
				};
				
				blackImg.src = blackSvgDataUrl;
				coloredImg.src = svgDataUrl;
			});
		} catch (error) {
			log.warn(`[PlacesLayer] Error loading Font Awesome icon ${iconName}:`, error);
		}
	}

	/**
	 * Load all required Font Awesome icons with colors
	 */
	async function loadRequiredIcons(map: MapLibreMap, features: Array<{ properties?: GeoJsonProperties }>): Promise<void> {
		const iconLoads: Promise<void>[] = [];
		
		for (const feature of features) {
			const iconName = feature.properties?.iconName;
			const iconColor = feature.properties?.iconColor;
			
			if (iconName && typeof iconName === 'string' && iconColor && typeof iconColor === 'string' && !loadedIcons.has(iconName)) {
				iconLoads.push(loadFontAwesomeIcon(map, iconName, iconColor));
			}
		}

		// Load icons in parallel
		await Promise.all(iconLoads);
	}

	/**
	 * Compute supply/demand and good type for a place
	 */
	function computePlaceProperties(
		placeId: number,
		categoryName: string,
		gameStateSeed: number | null,
		placeGoodsConfig: any
	): { type: 'supply' | 'demand'; good: string; iconName: string | null } | null {
		if (!gameStateSeed || !placeGoodsConfig) {
			return null;
		}

		// Check cache first
		const cacheKey = getCacheKey(placeId, gameStateSeed);
		const cached = computedPropertiesCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		// Find category goods config
		const categoryGoods = placeGoodsConfig.categories?.find(
			(cat: PlaceCategoryGoods) => cat.name === categoryName
		);

		if (!categoryGoods) {
			return null;
		}

		// Compute supply/demand and good type
		const selectedGoods = selectPlaceGoods(gameStateSeed, placeId, categoryGoods);
		const iconName = getGoodsIconName(selectedGoods.good);

		const result = {
			type: selectedGoods.type,
			good: selectedGoods.good,
			iconName
		};

		// Cache result
		computedPropertiesCache.set(cacheKey, result);

		return result;
	}

	/**
	 * Update GeoJSON source with visible features and computed properties
	 */
	async function updatePlacesGeoJSON() {
		if (!mapInstance) return;

		const gameState = get(currentGameState);
		const placeGoodsConfig = get(placeGoods);

		if (!gameState?.seed || !placeGoodsConfig) {
			// Clear GeoJSON if we don't have required data
			placesGeoJSON = {
				type: 'FeatureCollection',
				features: []
			};
			updateGeoJSONSource();
			return;
		}

		try {
			// Check if the layer exists and source is loaded before querying
			if (!mapInstance.getLayer('active-places-circles')) {
				// Layer doesn't exist yet, skip update
				return;
			}

			// Check if source is loaded
			const source = mapInstance.getSource('martin-active-places');
			if (!source || source.type !== 'vector') {
				return;
			}

			// Query visible features from vector tile source
			const features = mapInstance.queryRenderedFeatures(undefined, {
				layers: ['active-places-circles']
			});

			if (!features || features.length === 0) {
				placesGeoJSON = {
					type: 'FeatureCollection',
					features: []
				};
				updateGeoJSONSource();
				return;
			}

			// Build GeoJSON features with computed properties
			const geoJSONFeatures: GeoJSON.Feature<Point>[] = [];

			for (const feature of features) {
				const props = feature.properties || {};
				const placeId = Number(props.place_id ?? props.placeId ?? 0);
				const categoryName = props.category_name ?? props.categoryName ?? 'Unknown';

				if (!placeId || !feature.geometry || feature.geometry.type !== 'Point') {
					continue;
				}

				// Compute properties
				const computed = computePlaceProperties(
					placeId,
					categoryName,
					gameState.seed,
					placeGoodsConfig
				);

				if (!computed) {
					continue;
				}

				// Create unique icon name based on type (supply/demand) and good type
				// This allows us to load colored versions of icons
				const coloredIconName = `${computed.iconName}-${computed.type}`;
				
				// Store color for icon loading
				const iconColor = computed.type === 'supply' ? '#16a34a' : '#dc2626'; // dark green / dark red

				// Create GeoJSON feature with computed properties
				const geoJSONFeature = {
					type: 'Feature' as const,
					geometry: feature.geometry,
					properties: {
						placeId,
						categoryName,
						regionCode: props.region_code ?? props.regionCode ?? null,
						type: computed.type,
						good: computed.good,
						iconName: coloredIconName,
						baseIconName: computed.iconName,
						iconColor
					}
				};

				geoJSONFeatures.push(geoJSONFeature);
			}

			// Load required icons BEFORE setting GeoJSON data
			// This ensures icons are available when MapLibre tries to render them
			await loadRequiredIcons(mapInstance, geoJSONFeatures);

			placesGeoJSON = {
				type: 'FeatureCollection',
				features: geoJSONFeatures
			};

			// Update GeoJSON source after icons are loaded
			updateGeoJSONSource();
		} catch (error) {
			log.error('[PlacesLayer] Error updating places GeoJSON:', error);
		}
	}


	/**
	 * Update the GeoJSON source data
	 */
	function updateGeoJSONSource() {
		if (!mapInstance) {
			return;
		}

		const source = mapInstance.getSource('places-geojson') as GeoJSONSourceType;
		if (source) {
			source.setData(placesGeoJSON);
		}
	}

	// Reactive: Update GeoJSON source when placesGeoJSON changes
	$: if (mapInstance && placesGeoJSON) {
		// Ensure source exists before updating
		const source = mapInstance.getSource('places-geojson');
		if (source) {
			(source as GeoJSONSourceType).setData(placesGeoJSON);
		}
	}

	// Reactive: Update GeoJSON when game state or place goods config changes
	$: {
		if (mapInstance) {
			const gameState = get(currentGameState);
			const placeGoodsConfig = get(placeGoods);
			
			// Clear cache if seed changes
			if (gameState?.seed) {
				const currentSeed = gameState.seed;
				// Remove cache entries with different seed
				for (const [key] of computedPropertiesCache) {
					const [, seedStr] = key.split(':');
					if (Number(seedStr) !== currentSeed) {
						computedPropertiesCache.delete(key);
					}
				}
			}

			// Update GeoJSON when data is available
			if (gameState?.seed && placeGoodsConfig) {
				updatePlacesGeoJSON();
			}
		}
	}

	// Setup map event listeners for updating visible features
	let mapListenersSetup = false;

	function setupMapListeners() {
		if (!mapInstance || mapListenersSetup) return;

		// Handle missing images by loading them on demand
		mapInstance.on('styleimagemissing', async (e: { id: string }) => {
			const iconName = e.id;
			// Check if it's one of our Font Awesome icons
			if (iconName.includes('-supply') || iconName.includes('-demand')) {
				const color = iconName.includes('-supply') ? '#16a34a' : '#dc2626'; // dark green / dark red
				await loadFontAwesomeIcon(mapInstance, iconName, color);
			}
		});

		// Debounce updates to avoid spam
		let updateTimeout: ReturnType<typeof setTimeout> | null = null;
		const debouncedUpdate = () => {
			if (updateTimeout) {
				clearTimeout(updateTimeout);
			}
			updateTimeout = setTimeout(() => {
				updatePlacesGeoJSON();
			}, 150); // 150ms debounce
		};

		mapInstance.on('moveend', debouncedUpdate);
		mapInstance.on('zoomend', debouncedUpdate);
		mapInstance.on('data', (e: MapDataEvent) => {
			// Update when vector tile data loads
			// Check if the event is for our source by checking the source property
			const source = (e as any).source;
			if (source && source.id === 'martin-active-places') {
				debouncedUpdate();
			}
		});

		mapListenersSetup = true;

		// Preload all icons first, then do initial update
		preloadAllIcons().then(() => {
			// Initial update after icons are loaded
			setTimeout(() => {
				updatePlacesGeoJSON();
			}, 200);
		});
	}

	// Setup listeners when map instance is available
	$: {
		if (mapInstance && !mapListenersSetup) {
			setupMapListeners();
		}
	}

	// Cleanup on destroy
	onDestroy(() => {
		computedPropertiesCache.clear();
		loadedIcons.clear();
	});
</script>

<!-- Vector tile source (used for querying visible features) -->
<!-- Keep a very small, nearly invisible layer for querying purposes -->
<VectorTileSource id="martin-active-places" url={martinActivePlacesUrl}>
	<CircleLayer
		id="active-places-circles"
		sourceLayer="enhanced_active_places_with_geom"
		paint={{
			'circle-radius': 0.5,
			'circle-color': 'rgba(0,0,0,0)',
			'circle-stroke-width': 0
		}}
	/>
</VectorTileSource>

<!-- GeoJSON source with computed properties -->
<GeoJSONSource id="places-geojson" data={placesGeoJSON}>
	<!-- Icons for good types - colored and hoverable -->
	<SymbolLayer
		id="places-icons"
		filter={['has', 'iconName']}
		layout={{
			'icon-image': ['get', 'iconName'],
			'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.5, 16, 0.75],
			'icon-allow-overlap': true,
			'icon-ignore-placement': true
		}}
	/>
</GeoJSONSource>
