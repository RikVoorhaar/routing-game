import { cheatSettings, cheatActions } from '$lib/stores/cheats';
import { get } from 'svelte/store';
import { log } from '$lib/logger';

/**
 * MapManager handles Leaflet map initialization and tile management
 */
export class MapManager {
	private map: any = null;
	private L: any = null;
	private tileLayer: any = null;
	private lastVisibleTiles: Set<string> = new Set();

	constructor(
		private mapElement: HTMLDivElement,
		private onTileChange?: () => void
	) {}

	/**
	 * Initialize the Leaflet map
	 */
	async init(): Promise<{ map: any; L: any }> {
		try {
			// Import Leaflet dynamically
			this.L = (await import('leaflet')).default;

			// Fix default marker icons
			// @ts-ignore
			delete this.L.Icon.Default.prototype._getIconUrl;
			this.L.Icon.Default.mergeOptions({
				iconRetinaUrl:
					'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
				iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
				shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
			});

			log.info('[MapManager] Creating Leaflet map');

			// Create map
			this.map = this.L.map(this.mapElement, {
				center: [52.0907, 5.1214], // Utrecht, Netherlands
				zoom: 13,
				zoomControl: true,
				attributionControl: true
			});

			// Add tile layer
			this.tileLayer = this.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '© OpenStreetMap contributors',
				maxZoom: 17
			}).addTo(this.map);

			// Setup tile event listeners
			this.setupTileDebugListeners();

			// Initialize visible tiles tracking
			this.lastVisibleTiles = new Set(this.getVisibleTiles());

			return { map: this.map, L: this.L };
		} catch (error) {
			log.error('[MapManager] Failed to initialize map:', error);
			throw error;
		}
	}

	/**
	 * Setup tile debug listeners for development
	 */
	private setupTileDebugListeners() {
		if (!this.map || !this.L) return;

		// Find the tile layer
		this.map.eachLayer((layer: any) => {
			if (layer instanceof this.L.TileLayer) {
				this.tileLayer = layer;

				// Listen for tile events
				layer.on('tileloadstart', (e: any) => {
					if (get(cheatSettings).showTileDebug && e.coords) {
						const tileKey = `${e.coords.z}/${e.coords.x}/${e.coords.y}`;
						cheatActions.addActiveTile(tileKey);
					}
				});

				layer.on('tileload', (e: any) => {
					// Tile loaded successfully - could be used for additional info
				});

				layer.on('tileerror', (e: any) => {
					if (get(cheatSettings).showTileDebug && e.coords) {
						const tileKey = `${e.coords.z}/${e.coords.x}/${e.coords.y}`;
						cheatActions.removeActiveTile(tileKey);
					}
				});
			}
		});

		// Listen for map events that change tiles
		this.map.on('moveend zoomend', () => {
			log.debug('[MapManager] Map moved/zoomed, checking for tile changes');

			// Check if tiles actually changed
			const currentTiles = new Set(this.getVisibleTiles());
			const tilesChanged = !this.setsEqual(currentTiles, this.lastVisibleTiles);

			if (tilesChanged) {
				log.debug('[MapManager] Tiles changed, updating');
				this.lastVisibleTiles = currentTiles;

				if (get(cheatSettings).showTileDebug) {
					this.updateActiveTiles();
				}

				// Notify about tile changes only when tiles actually changed
				if (this.onTileChange) {
					log.debug('[MapManager] Calling onTileChange callback');
					this.onTileChange();
				}
			} else {
				log.debug('[MapManager] No tile changes, skipping update');
			}
		});
	}

	/**
	 * Update active tiles for debug display
	 */
	private updateActiveTiles() {
		if (!this.map || !this.tileLayer) return;

		const bounds = this.map.getBounds();
		const zoom = this.map.getZoom();
		const activeTileSet = new Set<string>();

		// Calculate visible tiles based on current bounds and zoom
		const northWest = this.map.project(bounds.getNorthWest(), zoom);
		const southEast = this.map.project(bounds.getSouthEast(), zoom);

		const tileSize = 256; // Standard tile size
		const minTileX = Math.floor(northWest.x / tileSize);
		const maxTileX = Math.floor(southEast.x / tileSize);
		const minTileY = Math.floor(northWest.y / tileSize);
		const maxTileY = Math.floor(southEast.y / tileSize);

		// Add all visible tiles to the set
		for (let x = minTileX; x <= maxTileX; x++) {
			for (let y = minTileY; y <= maxTileY; y++) {
				const tileKey = `${zoom}/${x}/${y}`;
				activeTileSet.add(tileKey);
			}
		}

		cheatActions.setActiveTiles(activeTileSet);
	}

	/**
	 * Get current visible tiles
	 */
	getVisibleTiles(): string[] {
		if (!this.map) return [];

		const bounds = this.map.getBounds();
		const zoom = this.map.getZoom();
		const tiles: string[] = [];

		// Calculate visible tiles based on current bounds and zoom
		const northWest = this.map.project(bounds.getNorthWest(), zoom);
		const southEast = this.map.project(bounds.getSouthEast(), zoom);

		const tileSize = 256; // Standard tile size
		const minTileX = Math.floor(northWest.x / tileSize);
		const maxTileX = Math.floor(southEast.x / tileSize);
		const minTileY = Math.floor(northWest.y / tileSize);
		const maxTileY = Math.floor(southEast.y / tileSize);

		// Add all visible tiles to the array
		for (let x = minTileX; x <= maxTileX; x++) {
			for (let y = minTileY; y <= maxTileY; y++) {
				tiles.push(`${zoom}/${x}/${y}`);
			}
		}

		return tiles;
	}

	/**
	 * Get map instance
	 */
	getMap() {
		return this.map;
	}

	/**
	 * Get Leaflet library instance
	 */
	getLeaflet() {
		return this.L;
	}

	/**
	 * Compare two sets for equality
	 */
	private setsEqual(set1: Set<string>, set2: Set<string>): boolean {
		if (set1.size !== set2.size) {
			return false;
		}
		for (const item of set1) {
			if (!set2.has(item)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Cleanup resources
	 */
	destroy() {
		if (this.map) {
			this.map.remove();
			this.map = null;
		}
		this.L = null;
		this.tileLayer = null;
	}
}
