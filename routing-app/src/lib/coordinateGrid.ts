import * as turf from '@turf/turf';
import type { Coordinate } from '$lib/server/db/schema';

export interface BoundingBox {
	north: number; // max latitude
	south: number; // min latitude
	east: number; // max longitude
	west: number; // min longitude
}

export interface ChunkCoordinate {
	x: number;
	y: number;
}

export interface ChunkBounds {
	north: number;
	south: number;
	east: number;
	west: number;
}

export class ChunkGrid {
	public readonly bbox: BoundingBox;
	public readonly scaleKm: number; // in kilometers
	public readonly degreesLatitude: number;
	public readonly degreesLongitude: number;
	private readonly midLatitude: number;

	constructor(bbox: BoundingBox, scaleKm: number) {
		// Validate inputs
		if (scaleKm <= 0) {
			throw new Error('Scale must be positive');
		}
		if (bbox.north <= bbox.south) {
			throw new Error('North must be greater than south');
		}
		if (bbox.east <= bbox.west) {
			throw new Error('East must be greater than west');
		}
		if (bbox.north > 90 || bbox.south < -90) {
			throw new Error('Latitude must be between -90 and 90 degrees');
		}
		if (bbox.east > 180 || bbox.west < -180) {
			throw new Error('Longitude must be between -180 and 180 degrees');
		}

		this.bbox = bbox;
		this.scaleKm = scaleKm;
		this.midLatitude = (bbox.north + bbox.south) / 2;

		// Calculate degrees of latitude for the given scale using turf.destination
		const centerLon = (bbox.east + bbox.west) / 2;
		const centerPoint = turf.point([centerLon, this.midLatitude]);

		// Move north by the scale distance to get latitude degrees
		const northPoint = turf.destination(centerPoint, scaleKm, 0, { units: 'kilometers' });
		this.degreesLatitude = northPoint.geometry.coordinates[1] - this.midLatitude;

		// Move east by the scale distance to get longitude degrees
		const eastPoint = turf.destination(centerPoint, scaleKm, 90, { units: 'kilometers' });
		this.degreesLongitude = eastPoint.geometry.coordinates[0] - centerLon;
	}

	/**
	 * Get the chunk coordinates for a given lat/lon point
	 * Returns integer coordinates (x, y) representing the chunk
	 */
	getChunk(lat: number, lon: number): ChunkCoordinate {
		// Validate inputs
		if (lat < this.bbox.south || lat > this.bbox.north) {
			throw new Error(`Latitude ${lat} is outside bounding box`);
		}
		if (lon < this.bbox.west || lon > this.bbox.east) {
			throw new Error(`Longitude ${lon} is outside bounding box`);
		}

		// Calculate relative position from top-left (northwest) corner
		const relativeLatFromNorth = this.bbox.north - lat;
		const relativeLonFromWest = lon - this.bbox.west;

		// Calculate chunk coordinates
		const x = Math.floor(relativeLonFromWest / this.degreesLongitude);
		const y = Math.floor(relativeLatFromNorth / this.degreesLatitude);

		return { x, y };
	}

	/**
	 * Get the boundaries of a specific chunk
	 */
	getChunkBounds(chunkX: number, chunkY: number): ChunkBounds {
		if (chunkX < 0 || chunkY < 0) {
			throw new Error('Chunk coordinates must be non-negative');
		}

		const west = this.bbox.west + chunkX * this.degreesLongitude;
		const east = this.bbox.west + (chunkX + 1) * this.degreesLongitude;
		const north = this.bbox.north - chunkY * this.degreesLatitude;
		const south = this.bbox.north - (chunkY + 1) * this.degreesLatitude;

		// Ensure bounds don't exceed the original bounding box
		return {
			north: Math.min(north, this.bbox.north),
			south: Math.max(south, this.bbox.south),
			east: Math.min(east, this.bbox.east),
			west: Math.max(west, this.bbox.west)
		};
	}

	/**
	 * Get the center point of a specific chunk
	 */
	getChunkCenter(chunkX: number, chunkY: number): Coordinate {
		const bounds = this.getChunkBounds(chunkX, chunkY);
		return {
			lat: (bounds.north + bounds.south) / 2,
			lon: (bounds.east + bounds.west) / 2
		};
	}

	/**
	 * Get the total number of chunks in the grid
	 */
	getGridDimensions(): { width: number; height: number; totalChunks: number } {
		const width = Math.ceil((this.bbox.east - this.bbox.west) / this.degreesLongitude);
		const height = Math.ceil((this.bbox.north - this.bbox.south) / this.degreesLatitude);

		return {
			width,
			height,
			totalChunks: width * height
		};
	}

	/**
	 * Check if a chunk coordinate is valid (within the grid bounds)
	 */
	isValidChunk(chunkX: number, chunkY: number): boolean {
		const dimensions = this.getGridDimensions();
		return chunkX >= 0 && chunkX < dimensions.width && chunkY >= 0 && chunkY < dimensions.height;
	}

	/**
	 * Get all neighboring chunks (including diagonals) for a given chunk
	 */
	getNeighbors(chunkX: number, chunkY: number): ChunkCoordinate[] {
		const neighbors: ChunkCoordinate[] = [];

		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (dx === 0 && dy === 0) continue; // Skip the center chunk itself

				const neighborX = chunkX + dx;
				const neighborY = chunkY + dy;

				if (this.isValidChunk(neighborX, neighborY)) {
					neighbors.push({ x: neighborX, y: neighborY });
				}
			}
		}

		return neighbors;
	}

	/**
	 * Get all chunks that intersect with the given bounding box
	 * Perfect for finding chunks visible in a map view
	 */
	getChunksInBounds(bbox: BoundingBox): ChunkCoordinate[] {
		// Clamp the input bbox to our grid's bounds to avoid errors
		const clampedBbox = {
			north: Math.min(bbox.north, this.bbox.north),
			south: Math.max(bbox.south, this.bbox.south),
			east: Math.min(bbox.east, this.bbox.east),
			west: Math.max(bbox.west, this.bbox.west)
		};

		// If the clamped bbox is invalid (no intersection), return empty array
		if (clampedBbox.north <= clampedBbox.south || clampedBbox.east <= clampedBbox.west) {
			return [];
		}

		// Get chunk coordinates for the corners of the bounding box
		// Northwest corner gives us the minimum chunk coordinates
		const nwChunk = this.getChunk(clampedBbox.north, clampedBbox.west);
		// Southeast corner gives us the maximum chunk coordinates
		const seChunk = this.getChunk(clampedBbox.south, clampedBbox.east);

		const chunks: ChunkCoordinate[] = [];

		// Iterate through all chunks in the rectangular range
		for (let x = nwChunk.x; x <= seChunk.x; x++) {
			for (let y = nwChunk.y; y <= seChunk.y; y++) {
				if (this.isValidChunk(x, y)) {
					chunks.push({ x, y });
				}
			}
		}

		return chunks;
	}
}
