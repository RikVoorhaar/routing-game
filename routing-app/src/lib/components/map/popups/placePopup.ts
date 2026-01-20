import type { Place } from '$lib/stores/placesCache';
import type { PlaceGoodsConfig, PlaceCategoryGoods } from '$lib/config/placeGoodsTypes';

/**
 * Create popup HTML for place marker
 *
 * Parameters
 * -----------
 * place: Place
 *     The place to create popup for
 * placeGoodsConfig: PlaceGoodsConfig | null
 *     The place goods configuration (optional)
 * selectedGoods: { type: 'supply' | 'demand', good: string } | null
 *     Selected goods for this place
 * supplyAmount: number | null
 *     Supply amount in kg (for suppliers)
 * vehicleCapacity: number | null
 *     Vehicle capacity in kg (for comparison)
 * jobValue: number | null
 *     Job value in euros (for demand nodes)
 * routeDuration: number | null
 *     Route duration in seconds (for demand nodes)
 * jobXp: number | null
 *     Job XP (for demand nodes)
 * supplyPlaceId: number | null
 *     Supply place ID (for accept job button on demand nodes)
 *
 * Returns
 * --------
 * string
 *     HTML string for the popup
 */
export function createPlacePopupHTML(
	place: Place,
	placeGoodsConfig: PlaceGoodsConfig | null = null,
	selectedGoods: { type: 'supply' | 'demand'; good: string } | null = null,
	supplyAmount: number | null = null,
	vehicleCapacity: number | null = null,
	jobValue: number | null = null,
	routeDuration: number | null = null,
	jobXp: number | null = null,
	supplyPlaceId: number | null = null
): string {
	const nodeType = selectedGoods?.type === 'supply' ? 'Supply' : selectedGoods?.type === 'demand' ? 'Demand' : 'Unknown';
	const goodName = selectedGoods?.good ?? 'Unknown';

	// Format duration
	function formatDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		if (minutes > 0) {
			return `${minutes}m ${secs}s`;
		}
		return `${secs}s`;
	}

	// Supply node popup: Region, node type, supply amount
	if (selectedGoods?.type === 'supply') {
		return `
			<div class="place-popup" style="min-width: 180px; font-family: system-ui, sans-serif;">
				<div style="margin-bottom: 8px;">
					<div style="font-size: 14px; font-weight: 600; color: #1f2937;">
						${place.category}
					</div>
				</div>
				<div style="display: grid; gap: 6px; font-size: 11px;">
					${place.region ? `
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Region</div>
						<div style="font-weight: 500; color: #374151;">${place.region}</div>
					</div>
					` : ''}
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Type</div>
						<div style="font-weight: 500; color: #374151;">${nodeType}: ${goodName}</div>
					</div>
					${supplyAmount !== null ? `
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Supply Amount</div>
						<div style="font-weight: 500; color: #374151;">${supplyAmount.toFixed(1)} kg</div>
					</div>
					` : ''}
				</div>
			</div>
		`;
	}

	// Demand node popup: Region, node type, XP, job value, duration, Accept Job button
	if (selectedGoods?.type === 'demand') {
		const acceptButtonId = `accept-job-btn-${place.id}`;
		const durationText = routeDuration !== null ? formatDuration(routeDuration) : 'Computing...';
		
		return `
			<div class="place-popup" style="min-width: 200px; font-family: system-ui, sans-serif;">
				<div style="margin-bottom: 8px;">
					<div style="font-size: 14px; font-weight: 600; color: #1f2937;">
						${place.category}
					</div>
				</div>
				<div style="display: grid; gap: 6px; font-size: 11px;">
					${place.region ? `
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Region</div>
						<div style="font-weight: 500; color: #374151;">${place.region}</div>
					</div>
					` : ''}
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Type</div>
						<div style="font-weight: 500; color: #374151;">${nodeType}: ${goodName}</div>
					</div>
					${jobXp !== null ? `
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">XP</div>
						<div style="font-weight: 500; color: #374151;">${jobXp}</div>
					</div>
					` : ''}
					${jobValue !== null ? `
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Job Value</div>
						<div style="font-weight: 500; color: #059669;">€${jobValue.toFixed(2)}</div>
					</div>
					` : ''}
					${routeDuration !== null ? `
					<div>
						<div style="color: #888; margin-bottom: 2px; font-size: 10px;">Duration</div>
						<div style="font-weight: 500; color: #374151;">${durationText}</div>
					</div>
					` : ''}
				</div>
				${supplyPlaceId !== null ? `
				<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
					<button 
						id="${acceptButtonId}"
						style="width: 100%; padding: 8px 12px; background-color: #059669; color: white; border: none; border-radius: 4px; font-weight: 600; font-size: 12px; cursor: pointer;"
						onmouseover="this.style.backgroundColor='#047857'"
						onmouseout="this.style.backgroundColor='#059669'"
					>
						Accept Job
					</button>
				</div>
				` : ''}
			</div>
		`;
	}

	// Fallback for unknown type
	return `
		<div class="place-popup" style="min-width: 180px; font-family: system-ui, sans-serif;">
			<div style="margin-bottom: 8px;">
				<div style="font-size: 14px; font-weight: 600; color: #1f2937;">
					${place.category}
				</div>
			</div>
			${place.region ? `
			<div style="font-size: 11px;">
				<div style="color: #888; margin-bottom: 2px;">Region</div>
				<div style="font-weight: 500; color: #374151;">${place.region}</div>
			</div>
			` : ''}
		</div>
	`;
}
