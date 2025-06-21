<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatMoney } from '$lib/formatting';
	import type { Route, PathPoint, Address } from '$lib/types';
	import { log } from '$lib/logger';

	export let map: any;
	export let L: any;
	export let routes: Array<{
		route: Route;
		style: {
			color: string;
			weight: number;
			opacity: number;
			dashArray?: string;
		};
		onClick?: () => void;
	}> = [];

	let routePolylines: any[] = [];

	// Reactive updates
	$: {
		if (map && L) {
			updateRoutes();
		}
	}

	function updateRoutes() {
		// Clear existing polylines
		routePolylines.forEach((polyline) => {
			if (polyline && map.hasLayer(polyline)) {
				map.removeLayer(polyline);
			}
		});
		routePolylines = [];

		// Add new routes
		routes.forEach((routeDisplay) => {
			const polyline = createRoutePolyline(routeDisplay);
			if (polyline) {
				routePolylines.push(polyline);
			}
		});
	}

	function createRoutePolyline(routeDisplay: (typeof routes)[number]) {
		const { route, style, onClick } = routeDisplay;
		const routeData = parseRouteData(route.routeData);

		if (routeData.length === 0) return null;

		const routeCoords = routeData.map((point) => [point.coordinates.lat, point.coordinates.lon]);

		const polyline = L.polyline(routeCoords, {
			color: style.color,
			weight: style.weight,
			opacity: style.opacity,
			dashArray: style.dashArray
		}).addTo(map);

		// Add click handler if provided
		if (onClick) {
			polyline.on('click', onClick);
		}

		// Add popup with route info
		const startLocation = parseLocationData(route.startLocation);
		const endLocation = parseLocationData(route.endLocation);
		const rewardFormatted = formatMoney(route.reward);

		polyline.bindPopup(`
            <div>
                <strong>Route</strong><br>
                From: ${startLocation.city || 'Unknown'}<br>
                To: ${endLocation.city || 'Unknown'}<br>
                Duration: ${formatRouteDuration(route.lengthTime)}<br>
                Reward: ${rewardFormatted}<br>
                Goods: ${route.goodsType}
            </div>
        `);

		return polyline;
	}

	function parseRouteData(routeDataString: string | object): PathPoint[] {
		try {
			if (typeof routeDataString === 'string') {
				return JSON.parse(routeDataString) as PathPoint[];
			} else if (typeof routeDataString === 'object' && Array.isArray(routeDataString)) {
				return routeDataString as PathPoint[];
			} else {
				log.warn('[RouteRenderer] Invalid route data format:', typeof routeDataString);
				return [];
			}
		} catch (e) {
			log.error('[RouteRenderer] Failed to parse route data:', e);
			return [];
		}
	}

	function parseLocationData(location: string | object): Address {
		try {
			if (typeof location === 'string') {
				return JSON.parse(location) as Address;
			} else if (typeof location === 'object') {
				return location as Address;
			} else {
				return { city: 'Unknown' } as Address;
			}
		} catch (e) {
			return { city: 'Unknown' } as Address;
		}
	}

	function formatRouteDuration(seconds: number | string): string {
		const numericSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
		const hours = Math.floor(numericSeconds / 3600);
		const minutes = Math.floor((numericSeconds % 3600) / 60);

		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		} else {
			return `${minutes}m`;
		}
	}

	onDestroy(() => {
		// Clear all polylines when component is destroyed
		routePolylines.forEach((polyline) => {
			if (polyline && map.hasLayer(polyline)) {
				map.removeLayer(polyline);
			}
		});
	});
</script>
