import { writable, derived } from 'svelte/store';
import type { Route } from '$lib/server/db/schema';

/**
 * Route display styling options
 */
export interface RouteDisplayStyle {
	color: string;
	weight: number;
	opacity: number;
	dashArray?: string;
}

/**
 * Route display configuration
 */
export interface RouteDisplay {
	route: Route;
	style: RouteDisplayStyle;
	isSelected: boolean;
	isAvailable: boolean;
	isActive: boolean;
	onClick?: () => void;
}

/**
 * Tier colors for job markers
 */
export const TIER_COLORS = [
	'#6b7280', // tier 0 (shouldn't exist)
	'#10b981', // tier 1 - green
	'#3b82f6', // tier 2 - blue
	'#8b5cf6', // tier 3 - purple
	'#f59e0b', // tier 4 - amber
	'#ef4444', // tier 5 - red
	'#ec4899', // tier 6 - pink
	'#8b5cf6', // tier 7 - violet
	'#1f2937' // tier 8 - dark gray
];

/**
 * Get tier color for a given tier number
 * @param tier The tier number
 * @returns Hex color string
 */
export function getTierColor(tier: number): string {
	return TIER_COLORS[tier] || TIER_COLORS[0];
}

/**
 * Route style presets
 */
export const ROUTE_STYLES = {
	SELECTED: {
		color: '#dc2626', // red
		weight: 7,
		opacity: 0.95,
		dashArray: undefined
	} as RouteDisplayStyle,

	AVAILABLE: {
		color: '#f59e0b', // orange
		weight: 4,
		opacity: 0.7,
		dashArray: undefined
	} as RouteDisplayStyle,

	ACTIVE: {
		color: '#3b82f6', // blue
		weight: 5,
		opacity: 0.8,
		dashArray: undefined
	} as RouteDisplayStyle,

	DEFAULT: {
		color: '#3b82f6', // blue
		weight: 5,
		opacity: 0.8,
		dashArray: undefined
	} as RouteDisplayStyle
};

/**
 * Current routes to display on the map
 */
export const displayedRoutes = writable<RouteDisplay[]>([]);

/**
 * Map display settings
 */
export const mapDisplaySettings = writable({
	showJobs: true,
	showAvailableRoutes: true,
	showActiveRoutes: true,
	animateEmployees: true,
	jobZoomThreshold: 12 // Minimum zoom level to show jobs
});

/**
 * Actions for managing map display
 */
export const mapDisplayActions = {
	/**
	 * Clear all displayed routes
	 */
	clearRoutes() {
		displayedRoutes.set([]);
	},

	/**
	 * Add a route to display
	 */
	addRoute(
		route: Route,
		options: {
			isSelected?: boolean;
			isAvailable?: boolean;
			isActive?: boolean;
			onClick?: () => void;
		} = {}
	) {
		const { isSelected = false, isAvailable = false, isActive = false, onClick } = options;

		let style: RouteDisplayStyle;

		if (isSelected) {
			style = ROUTE_STYLES.SELECTED;
		} else if (isAvailable) {
			style = ROUTE_STYLES.AVAILABLE;
		} else if (isActive) {
			style = ROUTE_STYLES.ACTIVE;
		} else {
			style = ROUTE_STYLES.DEFAULT;
		}

		const routeDisplay: RouteDisplay = {
			route,
			style,
			isSelected,
			isAvailable,
			isActive,
			onClick
		};

		displayedRoutes.update((routes) => [...routes, routeDisplay]);
	},

	/**
	 * Remove a route from display
	 */
	removeRoute(routeId: string) {
		displayedRoutes.update((routes) => routes.filter((r) => r.route.id !== routeId));
	},

	/**
	 * Update route selection status
	 */
	selectRoute(routeId: string) {
		displayedRoutes.update((routes) =>
			routes.map((r) => ({
				...r,
				isSelected: r.route.id === routeId,
				style:
					r.route.id === routeId
						? ROUTE_STYLES.SELECTED
						: r.isAvailable
							? ROUTE_STYLES.AVAILABLE
							: r.isActive
								? ROUTE_STYLES.ACTIVE
								: ROUTE_STYLES.DEFAULT
			}))
		);
	},

	/**
	 * Update map display settings
	 */
	updateSettings(updates: Partial<typeof mapDisplaySettings>) {
		mapDisplaySettings.update((settings) => ({ ...settings, ...updates }));
	}
};

/**
 * Derived store for currently selected route
 */
export const selectedRouteDisplay = derived(displayedRoutes, ($displayedRoutes) => {
	return $displayedRoutes.find((r) => r.isSelected) || null;
});
