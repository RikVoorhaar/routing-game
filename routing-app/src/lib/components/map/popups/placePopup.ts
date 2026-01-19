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
 *     The place goods configuration (optional, will show goods if provided)
 *
 * Returns
 * --------
 * string
 *     HTML string for the popup
 */
export function createPlacePopupHTML(place: Place, placeGoodsConfig: PlaceGoodsConfig | null = null): string {
	// Find category goods data
	let categoryGoods: PlaceCategoryGoods | undefined;
	if (placeGoodsConfig) {
		categoryGoods = placeGoodsConfig.categories.find((cat) => cat.name === place.category);
	}

	// Format goods list HTML
	function formatGoodsList(goods: Array<{ good: string; fraction: number }>, label: string): string {
		if (goods.length === 0) {
			return '';
		}
		const goodsList = goods
			.map((g) => `<div style="margin-left: 12px; font-size: 10px; color: #6b7280;">${g.good}: ${(g.fraction * 100).toFixed(1)}%</div>`)
			.join('');
		return `
			<div style="margin-top: 8px;">
				<div style="color: #888; margin-bottom: 4px; font-size: 10px; font-weight: 600;">${label}</div>
				${goodsList}
			</div>
		`;
	}

	// Build supply/demand section
	let supplyDemandSection = '';
	if (categoryGoods) {
		supplyDemandSection = `
			<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
				<div style="margin-bottom: 8px;">
					<div style="color: #888; margin-bottom: 4px; font-size: 10px; font-weight: 600;">Supply/Demand</div>
					<div style="font-size: 10px; color: #374151;">
						<span style="color: #059669;">Supply: ${(categoryGoods.supply_fraction * 100).toFixed(1)}%</span>
						<span style="margin-left: 12px; color: #dc2626;">Demand: ${(categoryGoods.demand_fraction * 100).toFixed(1)}%</span>
					</div>
				</div>
				${formatGoodsList(categoryGoods.supply, 'Supplies')}
				${formatGoodsList(categoryGoods.demand, 'Demands')}
			</div>
		`;
	}

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
			${supplyDemandSection}
		</div>
	`;
}
