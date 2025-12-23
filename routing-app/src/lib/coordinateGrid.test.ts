import { describe, it, expect } from 'vitest';
import { ChunkGrid, type BoundingBox } from './coordinateGrid';

// Test bounding box around Utrecht, Netherlands - move to global scope
const utrechtBbox: BoundingBox = {
	north: 52.12,
	south: 52.08,
	east: 5.15,
	west: 5.1
};

describe('ChunkGrid', () => {
	describe('constructor', () => {
		it('should create a valid ChunkGrid with proper scale', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1); // 0.1 kilometer chunks

			expect(grid.bbox).toEqual(utrechtBbox);
			expect(grid.scaleKm).toBe(0.1);
			expect(grid.degreesLatitude).toBeCloseTo(0.0009, 3);
			expect(grid.degreesLongitude).toBeCloseTo(0.00146, 3);
		});

		it('should throw error for invalid scale', () => {
			expect(() => new ChunkGrid(utrechtBbox, 0)).toThrow('Scale must be positive');
			expect(() => new ChunkGrid(utrechtBbox, -0.1)).toThrow('Scale must be positive');
		});

		it('should throw error for invalid bounding box', () => {
			const invalidBbox1 = { north: 50, south: 55, east: 10, west: 5 }; // north < south
			expect(() => new ChunkGrid(invalidBbox1, 0.1)).toThrow('North must be greater than south');

			const invalidBbox2 = { north: 55, south: 50, east: 5, west: 10 }; // east < west
			expect(() => new ChunkGrid(invalidBbox2, 0.1)).toThrow('East must be greater than west');

			const invalidBbox3 = { north: 95, south: 50, east: 10, west: 5 }; // lat > 90
			expect(() => new ChunkGrid(invalidBbox3, 0.1)).toThrow(
				'Latitude must be between -90 and 90 degrees'
			);

			const invalidBbox4 = { north: 55, south: 50, east: 185, west: 5 }; // lon > 180
			expect(() => new ChunkGrid(invalidBbox4, 0.1)).toThrow(
				'Longitude must be between -180 and 180 degrees'
			);
		});
	});

	describe('getChunk', () => {
		it('should return correct chunk coordinates for points within bounds', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Test point very close to northwest corner (should be chunk 0,0)
			const northwestChunk = grid.getChunk(52.1199, 5.1001);
			expect(northwestChunk.x).toBe(0);
			expect(northwestChunk.y).toBe(0);

			// Test point in southeast corner
			const southeastChunk = grid.getChunk(52.081, 5.149);
			expect(southeastChunk.x).toBeGreaterThan(0);
			expect(southeastChunk.y).toBeGreaterThan(0);
		});

		it('should throw error for points outside bounding box', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			expect(() => grid.getChunk(52.15, 5.12)).toThrow('Latitude 52.15 is outside bounding box');
			expect(() => grid.getChunk(52.1, 5.2)).toThrow('Longitude 5.2 is outside bounding box');
		});

		it('should return integer coordinates', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const chunk = grid.getChunk(52.1, 5.12);

			expect(Number.isInteger(chunk.x)).toBe(true);
			expect(Number.isInteger(chunk.y)).toBe(true);
		});
	});

	describe('getChunkBounds', () => {
		it('should return correct boundaries for chunk', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const bounds = grid.getChunkBounds(0, 0);

			expect(bounds.west).toBe(utrechtBbox.west);
			expect(bounds.north).toBe(utrechtBbox.north);
			expect(bounds.east).toBeGreaterThan(bounds.west);
			expect(bounds.south).toBeLessThan(bounds.north);
		});

		it('should throw error for negative chunk coordinates', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			expect(() => grid.getChunkBounds(-1, 0)).toThrow('Chunk coordinates must be non-negative');
			expect(() => grid.getChunkBounds(0, -1)).toThrow('Chunk coordinates must be non-negative');
		});

		it('should not exceed original bounding box', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const dimensions = grid.getGridDimensions();

			// Test chunk at edge of grid
			const bounds = grid.getChunkBounds(dimensions.width - 1, dimensions.height - 1);

			expect(bounds.north).toBeLessThanOrEqual(utrechtBbox.north);
			expect(bounds.south).toBeGreaterThanOrEqual(utrechtBbox.south);
			expect(bounds.east).toBeLessThanOrEqual(utrechtBbox.east);
			expect(bounds.west).toBeGreaterThanOrEqual(utrechtBbox.west);
		});
	});

	describe('getChunkCenter', () => {
		it('should return center point of chunk', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const center = grid.getChunkCenter(0, 0);
			const bounds = grid.getChunkBounds(0, 0);

			expect(center.lat).toBeCloseTo((bounds.north + bounds.south) / 2, 6);
			expect(center.lon).toBeCloseTo((bounds.east + bounds.west) / 2, 6);
		});
	});

	describe('getGridDimensions', () => {
		it('should return correct grid dimensions', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const dimensions = grid.getGridDimensions();

			expect(dimensions.width).toBeGreaterThan(0);
			expect(dimensions.height).toBeGreaterThan(0);
			expect(dimensions.totalChunks).toBe(dimensions.width * dimensions.height);
		});

		it('should have more chunks with smaller scale', () => {
			const grid100 = new ChunkGrid(utrechtBbox, 0.1);
			const grid200 = new ChunkGrid(utrechtBbox, 0.2);

			const dim100 = grid100.getGridDimensions();
			const dim200 = grid200.getGridDimensions();

			expect(dim100.totalChunks).toBeGreaterThan(dim200.totalChunks);
		});
	});

	describe('isValidChunk', () => {
		it('should validate chunk coordinates correctly', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const dimensions = grid.getGridDimensions();

			expect(grid.isValidChunk(0, 0)).toBe(true);
			expect(grid.isValidChunk(dimensions.width - 1, dimensions.height - 1)).toBe(true);
			expect(grid.isValidChunk(-1, 0)).toBe(false);
			expect(grid.isValidChunk(0, -1)).toBe(false);
			expect(grid.isValidChunk(dimensions.width, 0)).toBe(false);
			expect(grid.isValidChunk(0, dimensions.height)).toBe(false);
		});
	});

	describe('getNeighbors', () => {
		it('should return all valid neighbors for interior chunk', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const neighbors = grid.getNeighbors(1, 1); // Interior chunk

			expect(neighbors).toHaveLength(8); // All 8 neighbors should be valid

			// Check that all neighbors are within 1 step of the original
			for (const neighbor of neighbors) {
				expect(Math.abs(neighbor.x - 1)).toBeLessThanOrEqual(1);
				expect(Math.abs(neighbor.y - 1)).toBeLessThanOrEqual(1);
				expect(neighbor.x !== 1 || neighbor.y !== 1).toBe(true); // Not the center chunk
			}
		});

		it('should return fewer neighbors for edge chunks', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const cornersNeighbors = grid.getNeighbors(0, 0); // Corner chunk

			expect(cornersNeighbors.length).toBeLessThan(8);
			expect(cornersNeighbors.length).toBeGreaterThan(0);
		});

		it('should not include invalid chunk coordinates', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);
			const neighbors = grid.getNeighbors(0, 0);

			for (const neighbor of neighbors) {
				expect(grid.isValidChunk(neighbor.x, neighbor.y)).toBe(true);
			}
		});
	});

	describe('coordinate consistency', () => {
		it('should have consistent coordinate mapping', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Test that a point in a chunk's bounds maps back to that chunk
			const chunkBounds = grid.getChunkBounds(1, 1);
			const centerPoint = {
				lat: (chunkBounds.north + chunkBounds.south) / 2,
				lon: (chunkBounds.east + chunkBounds.west) / 2
			};

			const mappedChunk = grid.getChunk(centerPoint.lat, centerPoint.lon);
			expect(mappedChunk.x).toBe(1);
			expect(mappedChunk.y).toBe(1);
		});
	});

	describe('different scales', () => {
		it('should work with various scales', () => {
			const scales = [0.05, 0.1, 0.2, 0.5, 1.0]; // in kilometers

			for (const scale of scales) {
				const grid = new ChunkGrid(utrechtBbox, scale);
				const testPoint = { lat: 52.1, lon: 5.12 };

				expect(() => grid.getChunk(testPoint.lat, testPoint.lon)).not.toThrow();

				const chunk = grid.getChunk(testPoint.lat, testPoint.lon);
				expect(Number.isInteger(chunk.x)).toBe(true);
				expect(Number.isInteger(chunk.y)).toBe(true);
			}
		});
	});

	describe('edge cases and real-world scenarios', () => {
		it('should handle very small scales', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.001); // 1 meter chunks
			const dimensions = grid.getGridDimensions();

			expect(dimensions.totalChunks).toBeGreaterThan(1000); // Should create many small chunks
		});

		it('should handle very large scales', () => {
			const grid = new ChunkGrid(utrechtBbox, 10); // 10km chunks
			const dimensions = grid.getGridDimensions();

			expect(dimensions.totalChunks).toBeLessThan(100); // Should create few large chunks
		});

		it('should work across different latitudes', () => {
			// Test near equator
			const equatorBbox: BoundingBox = { north: 1, south: -1, east: 1, west: -1 };
			const equatorGrid = new ChunkGrid(equatorBbox, 0.1);

			// Test near poles (but not too close to avoid extreme distortion)
			const arcticBbox: BoundingBox = { north: 70, south: 68, east: 1, west: -1 };
			const arcticGrid = new ChunkGrid(arcticBbox, 0.1);

			// Longitude degrees should be smaller at higher latitudes
			expect(arcticGrid.degreesLongitude).toBeGreaterThan(equatorGrid.degreesLongitude);
		});

		it('should handle international date line crossing', () => {
			const datelineBbox: BoundingBox = { north: 1, south: -1, east: -179, west: 179 };

			// This should throw an error since east < west in normal longitude terms
			expect(() => new ChunkGrid(datelineBbox, 0.1)).toThrow('East must be greater than west');
		});
	});

	describe('getChunksInBounds', () => {
		it('should return all chunks within a bounding box', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Create a small bbox in the center of the grid
			const viewBbox: BoundingBox = {
				north: 52.105,
				south: 52.095,
				east: 5.125,
				west: 5.115
			};

			const chunks = grid.getChunksInBounds(viewBbox);

			expect(chunks.length).toBeGreaterThan(0);

			// All returned chunks should be valid
			for (const chunk of chunks) {
				expect(grid.isValidChunk(chunk.x, chunk.y)).toBe(true);
				expect(Number.isInteger(chunk.x)).toBe(true);
				expect(Number.isInteger(chunk.y)).toBe(true);
			}
		});

		it('should return empty array for bbox outside grid bounds', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Bbox completely outside the grid
			const outsideBbox: BoundingBox = {
				north: 53.0,
				south: 52.9,
				east: 6.0,
				west: 5.9
			};

			const chunks = grid.getChunksInBounds(outsideBbox);
			expect(chunks).toHaveLength(0);
		});

		it('should handle bbox partially outside grid bounds', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Bbox that extends beyond the grid
			const partialBbox: BoundingBox = {
				north: 52.15, // Above grid bounds
				south: 52.1,
				east: 5.2, // Beyond grid bounds
				west: 5.12
			};

			const chunks = grid.getChunksInBounds(partialBbox);

			// Should return some chunks (the overlapping part)
			expect(chunks.length).toBeGreaterThan(0);

			// All chunks should be valid
			for (const chunk of chunks) {
				expect(grid.isValidChunk(chunk.x, chunk.y)).toBe(true);
			}
		});

		it('should return chunks in correct order', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			const viewBbox: BoundingBox = {
				north: 52.105,
				south: 52.095,
				east: 5.125,
				west: 5.115
			};

			const chunks = grid.getChunksInBounds(viewBbox);

			// Chunks should be ordered by x first, then y
			for (let i = 1; i < chunks.length; i++) {
				const prev = chunks[i - 1];
				const curr = chunks[i];

				if (prev.x === curr.x) {
					expect(curr.y).toBeGreaterThanOrEqual(prev.y);
				} else {
					expect(curr.x).toBeGreaterThan(prev.x);
				}
			}
		});

		it('should handle single chunk bbox', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Very small bbox that should only intersect one chunk
			const singleChunkBbox: BoundingBox = {
				north: 52.0901,
				south: 52.0899,
				east: 5.1211,
				west: 5.1209
			};

			const chunks = grid.getChunksInBounds(singleChunkBbox);

			expect(chunks.length).toBeGreaterThanOrEqual(1);
		});

		it('should work with the entire grid bbox', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			const chunks = grid.getChunksInBounds(utrechtBbox);
			const dimensions = grid.getGridDimensions();

			// Should return all chunks in the grid
			expect(chunks.length).toBe(dimensions.totalChunks);
		});

		it('should be useful for map viewport scenario', () => {
			const grid = new ChunkGrid(utrechtBbox, 0.1);

			// Simulate a map viewport centered on Utrecht
			const mapViewport: BoundingBox = {
				north: 52.11,
				south: 52.09,
				east: 5.14,
				west: 5.11
			};

			const visibleChunks = grid.getChunksInBounds(mapViewport);

			expect(visibleChunks.length).toBeGreaterThan(0);

			// Should be a reasonable number of chunks for a typical map view
			expect(visibleChunks.length).toBeLessThan(1000); // Not too many
			expect(visibleChunks.length).toBeGreaterThan(10); // Not too few

			// All chunks should be contiguous (form a rectangle)
			const minX = Math.min(...visibleChunks.map((c) => c.x));
			const maxX = Math.max(...visibleChunks.map((c) => c.x));
			const minY = Math.min(...visibleChunks.map((c) => c.y));
			const maxY = Math.max(...visibleChunks.map((c) => c.y));

			const expectedCount = (maxX - minX + 1) * (maxY - minY + 1);
			expect(visibleChunks.length).toBe(expectedCount);
		});
	});
});
