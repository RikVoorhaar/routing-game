import type { Place } from '$lib/stores/placesCache';

/**
 * Create popup HTML for place marker
 *
 * Parameters
 * -----------
 * place: Place
 *     The place to create popup for
 *
 * Returns
 * --------
 * string
 *     HTML string for the popup
 */
export function createPlacePopupHTML(place: Place): string {
	return `
		<div class="place-popup" style="min-width: 200px; font-family: system-ui, sans-serif;">
			<div style="margin-bottom: 8px;">
				<div style="font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 4px;">
					${place.category}
				</div>
			</div>

			<div style="display: grid; gap: 6px; font-size: 11px;">
				<div>
					<div style="color: #888; margin-bottom: 2px;">ID</div>
					<div style="font-weight: 500; color: #374151;">${place.id}</div>
				</div>
				<div>
					<div style="color: #888; margin-bottom: 2px;">Coordinates</div>
					<div style="font-weight: 500; color: #374151;">
						${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}
					</div>
				</div>
				${place.region ? `
				<div>
					<div style="color: #888; margin-bottom: 2px;">Region</div>
					<div style="font-weight: 500; color: #374151;">${place.region}</div>
				</div>
				` : ''}
			</div>
		</div>
	`;
}
