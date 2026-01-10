import { formatDistance, formatDuration } from '$lib/formatting';
import type { PathPoint } from '$lib/server/db/schema';

export const TRAVEL_DESTINATION_GO_BUTTON_ID = 'travel-destination-go-btn';
export const TRAVEL_DESTINATION_CANCEL_BUTTON_ID = 'travel-destination-cancel-btn';

export interface TravelRouteResult {
	path: PathPoint[];
	travelTimeSeconds: number;
	totalDistanceMeters: number;
}

/**
 * Create popup HTML for travel destination marker
 *
 * Parameters
 * -----------
 * routeResult: TravelRouteResult
 *     The route result with path, time, and distance
 *
 * Returns
 * --------
 * string
 *     HTML string for the popup
 */
export function createTravelDestinationPopupHTML(routeResult: TravelRouteResult): string {
	const distance = formatDistance(routeResult.totalDistanceMeters / 1000); // Convert meters to km
	const duration = formatDuration(routeResult.travelTimeSeconds);

	return `
		<div class="travel-destination-popup" style="min-width: 200px; font-family: system-ui, sans-serif;">
			<div style="margin-bottom: 12px;">
				<div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">Travel Destination</div>
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
					<div style="text-align: center;">
						<div style="color: #888; margin-bottom: 2px;">Distance</div>
						<div style="font-weight: bold; color: #3b82f6;">${distance}</div>
					</div>
					<div style="text-align: center;">
						<div style="color: #888; margin-bottom: 2px;">Duration</div>
						<div style="font-weight: bold; color: #f59e0b;">${duration}</div>
					</div>
				</div>
			</div>

			<div style="display: flex; gap: 6px;">
				<button
					id="${TRAVEL_DESTINATION_GO_BUTTON_ID}"
					style="
						flex: 1;
						background-color: #10b981;
						color: white;
						border: none;
						padding: 8px;
						border-radius: 4px;
						font-size: 12px;
						font-weight: 600;
						cursor: pointer;
					"
					onmouseover="this.style.backgroundColor='#059669'"
					onmouseout="this.style.backgroundColor='#10b981'"
				>Go</button>
				<button
					id="${TRAVEL_DESTINATION_CANCEL_BUTTON_ID}"
					style="
						background-color: #ef4444;
						color: white;
						border: none;
						padding: 8px 12px;
						border-radius: 4px;
						font-size: 12px;
						font-weight: 600;
						cursor: pointer;
					"
					onmouseover="this.style.backgroundColor='#dc2626'"
					onmouseout="this.style.backgroundColor='#ef4444'"
				>✕</button>
			</div>
		</div>
	`;
}
