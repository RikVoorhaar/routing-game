import { describe, it, expect } from 'vitest';
import { getRandomAddressInAnnulus } from './addresses';
import { DEFAULT_EMPLOYEE_LOCATION } from './employeeUtils';
import type { Coordinate } from './server/db/schema';

describe('addresses', () => {
	describe('getRandomAddressInAnnulus', () => {
		const center: Coordinate = {
			lat: DEFAULT_EMPLOYEE_LOCATION.lat,
			lon: DEFAULT_EMPLOYEE_LOCATION.lon
		};

		it('should return a valid address within the specified annulus', async () => {
			const minDistance = 0.5; // 500m
			const maxDistance = 2.0; // 2km

			const address = await getRandomAddressInAnnulus(center, minDistance, maxDistance);

			// Check address structure
			expect(address).toHaveProperty('id');
			expect(address).toHaveProperty('lat');
			expect(address).toHaveProperty('lon');
			expect(address).toHaveProperty('street');
			expect(address).toHaveProperty('houseNumber');
			expect(address).toHaveProperty('city');
			expect(address).toHaveProperty('postcode');
			expect(address).toHaveProperty('location');
			expect(address).toHaveProperty('createdAt');

			// Check that coordinates are numbers
			expect(typeof address.lat).toBe('number');
			expect(typeof address.lon).toBe('number');
			expect(typeof address.id).toBe('string');

			// Verify the address is within reasonable bounds (rough check)
			// This is not a precise distance calculation, just a sanity check
			const latDiff = Math.abs(address.lat - center.lat);
			const lonDiff = Math.abs(address.lon - center.lon);
			expect(latDiff).toBeLessThan(0.1); // Within ~11km latitude
			expect(lonDiff).toBeLessThan(0.1); // Within ~7km longitude at this latitude

			console.log(`Found address: ${address.street} ${address.houseNumber}, ${address.city}`);
		});

		it('should return different addresses on multiple calls', async () => {
			const minDistance = 0.3;
			const maxDistance = 1.5;

			// Get multiple addresses
			const addresses = await Promise.all([
				getRandomAddressInAnnulus(center, minDistance, maxDistance),
				getRandomAddressInAnnulus(center, minDistance, maxDistance),
				getRandomAddressInAnnulus(center, minDistance, maxDistance)
			]);

			// All should be valid addresses
			addresses.forEach(address => {
				expect(address).toHaveProperty('id');
				expect(typeof address.lat).toBe('number');
				expect(typeof address.lon).toBe('number');
			});

			// With high probability, at least one should be different
			// (This test might occasionally fail due to randomness, but very unlikely)
			const uniqueIds = new Set(addresses.map(addr => addr.id));
			expect(uniqueIds.size).toBeGreaterThan(1);
		});

		it('should handle small annulus ranges', async () => {
			const minDistance = 0.1; // 100m
			const maxDistance = 0.3; // 300m

			const address = await getRandomAddressInAnnulus(center, minDistance, maxDistance);

			expect(address).toHaveProperty('id');
			expect(typeof address.lat).toBe('number');
			expect(typeof address.lon).toBe('number');
		});

		it('should handle larger annulus ranges', async () => {
			const minDistance = 2.0; // 2km
			const maxDistance = 5.0; // 5km

			const address = await getRandomAddressInAnnulus(center, minDistance, maxDistance);

			expect(address).toHaveProperty('id');
			expect(typeof address.lat).toBe('number');
			expect(typeof address.lon).toBe('number');
		});

		it('should throw error for invalid distance parameters', async () => {
			// Negative minimum distance
			await expect(
				getRandomAddressInAnnulus(center, -1, 2)
			).rejects.toThrow('Minimum distance cannot be negative');

			// Maximum distance <= minimum distance
			await expect(
				getRandomAddressInAnnulus(center, 2, 1)
			).rejects.toThrow('Maximum distance must be greater than minimum distance');

			// Equal distances
			await expect(
				getRandomAddressInAnnulus(center, 1, 1)
			).rejects.toThrow('Maximum distance must be greater than minimum distance');
		});

		it('should throw error when no addresses found in annulus', async () => {
			// Use a location far from any addresses (e.g., middle of ocean)
			const remoteCenter: Coordinate = {
				lat: 0, // Equator in Atlantic Ocean
				lon: 0
			};

			await expect(
				getRandomAddressInAnnulus(remoteCenter, 0.1, 1.0)
			).rejects.toThrow('No address found in square annulus');
		});

		it('should handle zero minimum distance', async () => {
			const minDistance = 0; // 0m (center itself)
			const maxDistance = 1.0; // 1km

			const address = await getRandomAddressInAnnulus(center, minDistance, maxDistance);

			expect(address).toHaveProperty('id');
			expect(typeof address.lat).toBe('number');
			expect(typeof address.lon).toBe('number');
		});
	});
}); 