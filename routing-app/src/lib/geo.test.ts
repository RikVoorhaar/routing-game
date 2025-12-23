import { describe, it, expect } from 'vitest';
import { distance, randomCoordinateInAnnulus } from './geo';
import type { Coordinate } from './types';

describe('geospatial utilities', () => {
	describe('distance', () => {
		it('calculates distance between two points correctly', () => {
			const point1: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const point2: Coordinate = { lat: 52.086, lon: 5.1207 };

			const dist = distance(point1, point2);
			expect(dist).toBeGreaterThan(0);
			expect(dist).toBeLessThan(1); // Should be less than 1km for these points
		});

		it('returns 0 for identical points', () => {
			const point: Coordinate = { lat: 52.0907, lon: 5.1214 };
			expect(distance(point, point)).toBe(0);
		});
	});

	describe('randomCoordinateInAnnulus', () => {
		it('generates points within the specified annulus', () => {
			const center: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const minDistance = 1; // 1km
			const maxDistance = 2; // 2km

			// Generate multiple points to test distribution
			for (let i = 0; i < 100; i++) {
				const point = randomCoordinateInAnnulus(center, minDistance, maxDistance);
				const dist = distance(center, point);

				expect(dist).toBeGreaterThanOrEqual(minDistance);
				expect(dist).toBeLessThanOrEqual(maxDistance);
			}
		});

		it('handles zero minimum distance', () => {
			const center: Coordinate = { lat: 52.0907, lon: 5.1214 };
			const maxDistance = 1; // 1km

			const point = randomCoordinateInAnnulus(center, 0, maxDistance);
			const dist = distance(center, point);

			expect(dist).toBeGreaterThanOrEqual(0);
			expect(dist).toBeLessThanOrEqual(maxDistance);
		});

		it('throws error for invalid distances', () => {
			const center: Coordinate = { lat: 52.0907, lon: 5.1214 };

			expect(() => randomCoordinateInAnnulus(center, -1, 1)).toThrow();
			expect(() => randomCoordinateInAnnulus(center, 2, 1)).toThrow();
		});
	});
});
