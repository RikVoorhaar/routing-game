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
        } catch  {
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
            expect(route).toHaveProperty('totalDistanceMeters');
            expect(route).toHaveProperty('destination');
            
            // Check path
            expect(Array.isArray(route.path)).toBe(true);
            expect(route.path.length).toBeGreaterThan(0);
            route.path.forEach(point => {
                expect(point).toHaveProperty('coordinates');
                expect(point.coordinates).toHaveProperty('lat');
                expect(point.coordinates).toHaveProperty('lon');
                expect(point).toHaveProperty('cumulative_time_seconds');
                expect(point).toHaveProperty('cumulative_distance_meters');
                expect(point).toHaveProperty('max_speed_kmh');
                expect(typeof point.coordinates.lat).toBe('number');
                expect(typeof point.coordinates.lon).toBe('number');
                expect(typeof point.cumulative_time_seconds).toBe('number');
                expect(typeof point.cumulative_distance_meters).toBe('number');
                expect(typeof point.max_speed_kmh).toBe('number');
            });
            
            // Check travel time
            expect(typeof route.travelTimeSeconds).toBe('number');
            expect(route.travelTimeSeconds).toBeGreaterThan(0);
            
            // Check total distance
            expect(typeof route.totalDistanceMeters).toBe('number');
            expect(route.totalDistanceMeters).toBeGreaterThan(0);
            
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
            expect(route).toHaveProperty('totalDistanceMeters');
            expect(route).toHaveProperty('destination');
            expect(route.path.length).toBeGreaterThan(0);
        });
        
        it('respects max speed parameter', async () => {
            const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const minDistance = 0.5; // 500m
            const maxDistance = 1.0; // 1km
            const maxSpeed = 20; // 20 km/h
            
            const route = await getRandomRouteInAnnulus(from, minDistance, maxDistance, maxSpeed);
            
            expect(route).toHaveProperty('path');
            expect(route.path.length).toBeGreaterThan(0);
            
            // Check that all max_speed_kmh values are at or below the limit (except for starting point which is 0)
            route.path.forEach((point, index) => {
                if (index === 0) {
                    expect(point.max_speed_kmh).toBe(0); // Starting point has no incoming arc
                } else {
                    expect(point.max_speed_kmh).toBeLessThanOrEqual(maxSpeed);
                }
            });
        });
        
        it('throws error for invalid distances', async () => {
            const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
            
            await expect(getRandomRouteInAnnulus(from, -1, 1)).rejects.toThrow();
            await expect(getRandomRouteInAnnulus(from, 2, 1)).rejects.toThrow();
        });

        it('handles previously problematic route that required custom profile', async () => {
            // This specific route wasn't working before the custom profile implementation
            const from: Coordinate = { lat: 52.0907618944552, lon: 5.1211182687520695 };
            const to: Coordinate = { lat: 52.092416, lon: 5.118118 };
            
            // Make a direct routing request to test the specific route
            const response = await fetch(
                `http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
            );
            
            expect(response.ok).toBe(true);
            const data = await response.json();
            
            // Should now work with custom profile
            expect(data.success).toBe(true);
            expect(data).toHaveProperty('path');
            expect(data).toHaveProperty('travel_time_seconds');
            expect(data).toHaveProperty('total_distance_meters');
            
            expect(Array.isArray(data.path)).toBe(true);
            expect(data.path.length).toBeGreaterThan(0);
            expect(data.travel_time_seconds).toBeGreaterThan(0);
            expect(data.total_distance_meters).toBeGreaterThan(0);
            
            // Verify path structure matches new API
            data.path.forEach((point: any) => {
                expect(point).toHaveProperty('coordinates');
                expect(point.coordinates).toHaveProperty('lat');
                expect(point.coordinates).toHaveProperty('lon');
                expect(point).toHaveProperty('cumulative_time_seconds');
                expect(point).toHaveProperty('cumulative_distance_meters');
                expect(point).toHaveProperty('max_speed_kmh');
            });
        });

        it('handles the originally failing route with trimmed OSM data', async () => {
            // This is the route that was failing due to disconnected components
            const from: Coordinate = { lat: 52.09082916316217, lon: 5.12112919278711 };
            const to: Coordinate = { lat: 52.095032, lon: 5.121974 };
            
            // Make a direct routing request with max speed
            const response = await fetch(
                `http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}&max_speed=20`
            );
            
            expect(response.ok).toBe(true);
            const data = await response.json();
            
            // Should now work with trimmed OSM data (only largest connected component)
            expect(data.success).toBe(true);
            expect(data).toHaveProperty('path');
            expect(data).toHaveProperty('travel_time_seconds');
            expect(data).toHaveProperty('total_distance_meters');
            
            expect(Array.isArray(data.path)).toBe(true);
            expect(data.path.length).toBeGreaterThan(0);
            expect(data.travel_time_seconds).toBeGreaterThan(0);
            expect(data.total_distance_meters).toBeGreaterThan(0);
            
            // Verify path structure
            data.path.forEach((point: any) => {
                expect(point).toHaveProperty('coordinates');
                expect(point.coordinates).toHaveProperty('lat');
                expect(point.coordinates).toHaveProperty('lon');
                expect(point).toHaveProperty('cumulative_time_seconds');
                expect(point).toHaveProperty('cumulative_distance_meters');
                expect(point).toHaveProperty('max_speed_kmh');
            });
            
            // Verify max speed is respected
            data.path.forEach((point: any, index: number) => {
                if (index === 0) {
                    expect(point.max_speed_kmh).toBe(0); // Starting point has no incoming arc
                } else {
                    expect(point.max_speed_kmh).toBeLessThanOrEqual(20);
                }
            });
        });

        it('handles very close coordinates with fallback mechanism', async () => {
            // Test coordinates that are very close but map to disconnected nodes
            const from: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const to: Coordinate = { lat: 52.0908, lon: 5.1215 };
            
            // Make a direct routing request
            const response = await fetch(
                `http://localhost:8050/api/v1/shortest_path?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`
            );
            
            expect(response.ok).toBe(true);
            const data = await response.json();
            
            // Should succeed with fallback mechanism for close coordinates
            expect(data.success).toBe(true);
            expect(data).toHaveProperty('path');
            expect(data).toHaveProperty('travel_time_seconds');
            expect(data).toHaveProperty('total_distance_meters');
            
            // Should have a single point (fallback behavior)
            expect(Array.isArray(data.path)).toBe(true);
            expect(data.path.length).toBe(1);
            expect(data.travel_time_seconds).toBeGreaterThan(0);
            expect(data.total_distance_meters).toBeGreaterThan(0);
            expect(data.total_distance_meters).toBeLessThan(100); // Should be very short distance
            
            // Verify the single point structure
            const point = data.path[0];
            expect(point).toHaveProperty('coordinates');
            expect(point.coordinates).toHaveProperty('lat');
            expect(point.coordinates).toHaveProperty('lon');
            expect(point).toHaveProperty('cumulative_time_seconds');
            expect(point).toHaveProperty('cumulative_distance_meters');
            expect(point).toHaveProperty('max_speed_kmh');
            expect(point.cumulative_time_seconds).toBe(0);
            expect(point.cumulative_distance_meters).toBe(0);
            expect(point.max_speed_kmh).toBe(0);
        });
    });
}); 