import { describe, it, expect, beforeAll } from 'vitest';
import { getRandomRouteInAnnulus } from '../routing';
import { getServerHealth } from '../server';
import type { Coordinate } from '../types';

describe('routing functions (integration)', () => {
    beforeAll(async () => {
        // Check if server is running
        try {
            const health = await getServerHealth();
            expect(health.status).toBe('ok');
            expect(health.engine_initialized).toBe(true);
        } catch (error) {
            throw new Error('Routing server is not running. Please start it before running these tests.');
        }
    });
    
    describe('getRandomRouteInAnnulus', () => {
        it('returns a valid route within the specified annulus', async () => {
            const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const minDistance = 0.5; // 500m
            const maxDistance = 1.0; // 1km
            
            const route = await getRandomRouteInAnnulus(from, minDistance, maxDistance);
            
            // Check route structure
            expect(route).toHaveProperty('path');
            expect(route).toHaveProperty('travelTimeSeconds');
            expect(route).toHaveProperty('destination');
            
            // Check path
            expect(Array.isArray(route.path)).toBe(true);
            expect(route.path.length).toBeGreaterThan(0);
            route.path.forEach(point => {
                expect(Array.isArray(point)).toBe(true);
                expect(point.length).toBe(2);
                expect(typeof point[0]).toBe('number'); // lat
                expect(typeof point[1]).toBe('number'); // lon
            });
            
            // Check travel time
            expect(typeof route.travelTimeSeconds).toBe('number');
            expect(route.travelTimeSeconds).toBeGreaterThan(0);
            
            // Check destination
            expect(route.destination).toHaveProperty('id');
            expect(route.destination).toHaveProperty('lat');
            expect(route.destination).toHaveProperty('lon');
            
            // Check that destination is within reasonable bounds
            expect(route.destination.lat).toBeGreaterThan(from.lat - 0.1);
            expect(route.destination.lat).toBeLessThan(from.lat + 0.1);
            expect(route.destination.lon).toBeGreaterThan(from.lon - 0.1);
            expect(route.destination.lon).toBeLessThan(from.lon + 0.1);
        });
        
        it('handles larger distances', async () => {
            const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const minDistance = 2.0; // 2km
            const maxDistance = 3.0; // 3km
            
            const route = await getRandomRouteInAnnulus(from, minDistance, maxDistance);
            
            expect(route).toHaveProperty('path');
            expect(route).toHaveProperty('travelTimeSeconds');
            expect(route).toHaveProperty('destination');
            expect(route.path.length).toBeGreaterThan(0);
        });
        
        it('throws error for invalid distances', async () => {
            const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
            
            await expect(getRandomRouteInAnnulus(from, -1, 1)).rejects.toThrow();
            await expect(getRandomRouteInAnnulus(from, 2, 1)).rejects.toThrow();
        });
    });
}); 