<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatMoney, formatTimeFromSeconds } from '$lib/formatting';
	import type { PathPoint, Address } from '$lib/server/db/schema';
	import type { RouteDisplay } from '$lib/stores/mapDisplay';
	import { log } from '$lib/logger';

	export let map: any;
	export let L: any;
	export let routes: RouteDisplay[] = [];

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

	function createRoutePolyline(routeDisplay: RouteDisplay) {
		const { route, style, onClick } = routeDisplay;
		
		// Use the path directly from DisplayableRoute or parse from routeData
		let routeData: PathPoint[] = [];
		if (route.path && route.path.length > 0) {
			routeData = route.path;
		} else if (route.routeData) {
			routeData = parseRouteData(route.routeData);
		}

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
		const destination = route.destination;
		const durationFormatted = formatTimeFromSeconds(route.travelTimeSeconds);
		const distanceFormatted = `${(route.totalDistanceMeters / 1000).toFixed(1)} km`;

		polyline.bindPopup(`
            <div>
                <strong>Route ${route.id}</strong><br>
                ${destination ? `To: ${destination.city || 'Unknown'}<br>` : ''}
                Duration: ${durationFormatted}<br>
                Distance: ${distanceFormatted}<br>
                ${route.startTime ? `Started: ${new Date(route.startTime).toLocaleTimeString()}<br>` : ''}
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
