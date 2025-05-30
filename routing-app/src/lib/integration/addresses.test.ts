import { describe, it, expect, beforeAll } from 'vitest';
import { getRandomAddressInAnnulus } from '../addresses';
import { getServerHealth } from '../server';
import type { Coordinate } from '../types';

describe('address functions (integration)', () => {
    beforeAll(async () => {
        // Check if server is running
        try {
            const health = await getServerHealth();
            expect(health.status).toBe('ok');
            expect(health.engine_initialized).toBe(true);
        } catch  {
            throw new Error('Routing server is not running. Please start it before running these tests.');
        }
    });
    
    describe('getRandomAddressInAnnulus', () => {
        it('returns an address within the specified annulus', async () => {
            const center: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const minDistance = 0.5; // 500m
            const maxDistance = 1.0; // 1km
            
            const address = await getRandomAddressInAnnulus(center, minDistance, maxDistance);
            
            // Check address structure
            expect(address).toHaveProperty('id');
            expect(address).toHaveProperty('lat');
            expect(address).toHaveProperty('lon');
            
            // Check that coordinates are numbers
            expect(typeof address.lat).toBe('number');
            expect(typeof address.lon).toBe('number');
            
            // Check that coordinates are within reasonable bounds
            expect(address.lat).toBeGreaterThan(center.lat - 0.1);
            expect(address.lat).toBeLessThan(center.lat + 0.1);
            expect(address.lon).toBeGreaterThan(center.lon - 0.1);
            expect(address.lon).toBeLessThan(center.lon + 0.1);
        });
        
        it('handles larger distances', async () => {
            const center: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const minDistance = 2.0; // 2km
            const maxDistance = 3.0; // 3km
            
            const address = await getRandomAddressInAnnulus(center, minDistance, maxDistance);
            
            expect(address).toHaveProperty('id');
            expect(address).toHaveProperty('lat');
            expect(address).toHaveProperty('lon');
        });
        
        it('throws error for invalid distances', async () => {
            const center: Coordinate = { lat: 52.0907, lon: 5.1214 };
            
            await expect(getRandomAddressInAnnulus(center, -1, 1)).rejects.toThrow();
            await expect(getRandomAddressInAnnulus(center, 2, 1)).rejects.toThrow();
        });
    });
}); 