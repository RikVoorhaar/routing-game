import { cheatSettings } from '$lib/stores/cheats';
import { get } from 'svelte/store';
import type { Job } from '$lib/server/db/schema';

/**
 * Result of loading jobs for tiles
 */
export interface JobLoadResult {
	allJobs: Job[];
	newTiles: string[];
	removedTiles: string[];
}

/**
 * JobLoader handles loading jobs for visible map tiles
 */
export class JobLoader {
	private jobsByTile = new Map<string, Job[]>(); // Track jobs per tile
	private lastLoadedTiles = new Set<string>();

	/**
	 * Load jobs for the given tiles
	 * @param tiles Array of tile keys (e.g., ["13/4096/2048"])
	 * @param minZoom Minimum zoom level to load jobs
	 * @returns Promise that resolves to the loaded jobs
	 */
	async loadJobsForTiles(tiles: string[], minZoom: number = 12): Promise<JobLoadResult | null> {
		console.log(
			'[JobLoader] loadJobsForTiles called with',
			tiles.length,
			'tiles, minZoom:',
			minZoom
		);

		// Filter to only include tiles at sufficient zoom level
		const validTiles = tiles.filter((tile) => {
			const [z] = tile.split('/').map(Number);
			return z >= minZoom;
		});

		console.log(
			'[JobLoader] Valid tiles (zoom >= minZoom):',
			validTiles.length,
			'tiles:',
			validTiles
		);

		if (validTiles.length === 0) {
			console.log('[JobLoader] No valid tiles, clearing jobs');
			const removedTiles = Array.from(this.lastLoadedTiles);
			this.clearJobs();

			// If we had tiles before, return the clearing result
			if (removedTiles.length > 0) {
				return {
					allJobs: [],
					newTiles: [],
					removedTiles: removedTiles
				};
			}

			return null; // No changes
		}

		// Only fetch tiles we haven't loaded yet
		const tilesToLoad = validTiles.filter((tile) => !this.lastLoadedTiles.has(tile));

		console.log(
			'[JobLoader] Tiles to load (not already loaded):',
			tilesToLoad.length,
			'tiles:',
			tilesToLoad
		);
		console.log('[JobLoader] Already loaded tiles:', Array.from(this.lastLoadedTiles));

		// Remove jobs from tiles that are no longer visible
		const removedTiles = this.pruneInvisibleTiles(validTiles);

		if (tilesToLoad.length === 0 && removedTiles.length === 0) {
			console.log('[JobLoader] No tiles changed, skipping update');
			return null; // No changes
		}

		// If only tiles were removed but no new tiles to load
		if (tilesToLoad.length === 0 && removedTiles.length > 0) {
			console.log('[JobLoader] Only removed tiles, returning updated job list');
			return {
				allJobs: this.getAllJobs(),
				newTiles: [],
				removedTiles: removedTiles
			};
		}

		try {
			// Fetch jobs for new tiles in parallel
			console.log('[JobLoader] Starting to fetch jobs for', tilesToLoad.length, 'tiles');
			const jobPromises = tilesToLoad.map(async (tileKey) => {
				const [z, x, y] = tileKey.split('/').map(Number);
				const url = `/api/jobs/${z}/${x}/${y}`;
				console.log('[JobLoader] Fetching jobs from:', url);
				const response = await fetch(url);
				if (response.ok) {
					const data = await response.json();
					const jobs = data.jobs || [];
					console.log(`[JobLoader] Tile ${tileKey}: ${jobs.length} jobs`);
					if (get(cheatSettings).showTileDebug) {
						console.log(`🗺️ [Jobs] Tile ${tileKey}: ${jobs.length} jobs`);
					}

					// Store jobs for this tile
					this.jobsByTile.set(tileKey, jobs);
					this.lastLoadedTiles.add(tileKey);

					return { tileKey, jobs };
				} else {
					console.warn(`[JobLoader] Failed to load jobs for tile ${tileKey}:`, response.status);
					return { tileKey, jobs: [] };
				}
			});

			const tileResults = await Promise.all(jobPromises);
			console.log(
				'[JobLoader] Loaded jobs for',
				tileResults.length,
				'tiles, total jobs:',
				this.getAllJobs().length
			);

			// Return info about what tiles were loaded/unloaded for incremental rendering
			return {
				allJobs: this.getAllJobs(),
				newTiles: tileResults
					.filter((result) => result.jobs.length > 0)
					.map((result) => result.tileKey),
				removedTiles: removedTiles
			};
		} catch (error) {
			console.error('Error loading jobs for tiles:', error);
			return {
				allJobs: this.getAllJobs(),
				newTiles: [],
				removedTiles: []
			};
		}
	}

	/**
	 * Clear all loaded jobs and reset state
	 */
	clearJobs() {
		this.jobsByTile.clear();
		this.lastLoadedTiles.clear();
	}

	/**
	 * Get all currently loaded jobs
	 */
	getAllJobs(): Job[] {
		const allJobs: Job[] = [];
		for (const jobs of this.jobsByTile.values()) {
			allJobs.push(...jobs);
		}
		return allJobs;
	}

	/**
	 * Get jobs for a specific tile
	 */
	getJobsForTile(tileKey: string): Job[] {
		return this.jobsByTile.get(tileKey) || [];
	}

	/**
	 * Get the set of loaded tile keys
	 */
	getLoadedTiles(): Set<string> {
		return new Set(this.lastLoadedTiles);
	}

	/**
	 * Remove jobs from tiles that are no longer visible
	 * @param visibleTiles Array of currently visible tile keys
	 * @returns Array of removed tile keys
	 */
	private pruneInvisibleTiles(visibleTiles: string[]): string[] {
		const visibleTileSet = new Set(visibleTiles);

		// Remove tiles that are no longer visible
		const tilesToRemove = Array.from(this.lastLoadedTiles).filter(
			(tile) => !visibleTileSet.has(tile)
		);

		if (tilesToRemove.length > 0) {
			console.log('[JobLoader] Unloading', tilesToRemove.length, 'tiles:', tilesToRemove);
			tilesToRemove.forEach((tile) => {
				this.jobsByTile.delete(tile);
				this.lastLoadedTiles.delete(tile);
			});
		}

		return tilesToRemove;
	}
}
