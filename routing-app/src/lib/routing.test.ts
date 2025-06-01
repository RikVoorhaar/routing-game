import { describe, it, expect } from 'vitest';
import { interpolateLocationAtTime } from './routing';
import type { PathPoint } from './types';

describe('interpolateLocationAtTime', () => {
    // Sample path with known coordinates and times
    const samplePath: PathPoint[] = [
        {
            coordinates: { lat: 52.0907, lon: 5.1214 },
            cumulative_time_seconds: 0,
            cumulative_distance_meters: 0,
            max_speed_kmh: 0
        },
        {
            coordinates: { lat: 52.0905, lon: 5.1212 },
            cumulative_time_seconds: 10,
            cumulative_distance_meters: 250,
            max_speed_kmh: 30
        },
        {
            coordinates: { lat: 52.0903, lon: 5.1210 },
            cumulative_time_seconds: 20,
            cumulative_distance_meters: 500,
            max_speed_kmh: 50
        }
    ];

    it('returns null for empty path', () => {
        expect(interpolateLocationAtTime([], 5)).toBeNull();
    });

    it('returns first point for negative time', () => {
        expect(interpolateLocationAtTime(samplePath, -1)).toEqual({
            lat: samplePath[0].coordinates.lat,
            lon: samplePath[0].coordinates.lon
        });
    });

    it('returns first point for time before start', () => {
        const result = interpolateLocationAtTime(samplePath, -5);
        expect(result).toEqual({
            lat: samplePath[0].coordinates.lat,
            lon: samplePath[0].coordinates.lon
        });
    });

    it('returns last point for time after end', () => {
        const result = interpolateLocationAtTime(samplePath, 25);
        expect(result).toEqual({
            lat: samplePath[2].coordinates.lat,
            lon: samplePath[2].coordinates.lon
        });
    });

    it('returns exact point when time matches a point', () => {
        const result = interpolateLocationAtTime(samplePath, 10);
        expect(result).toEqual({
            lat: samplePath[1].coordinates.lat,
            lon: samplePath[1].coordinates.lon
        });
    });

    it('interpolates between points correctly', () => {
        // Test interpolation at 5 seconds (halfway between first and second point)
        const result = interpolateLocationAtTime(samplePath, 5);
        expect(result).not.toBeNull();
        if (result) {
            // Check that interpolated point is between the two points
            expect(result.lat).toBeLessThan(samplePath[0].coordinates.lat);
            expect(result.lat).toBeGreaterThan(samplePath[1].coordinates.lat);
            expect(result.lon).toBeLessThan(samplePath[0].coordinates.lon);
            expect(result.lon).toBeGreaterThan(samplePath[1].coordinates.lon);
        }
    });

    it('handles single point path', () => {
        const singlePointPath: PathPoint[] = [{
            coordinates: { lat: 52.0907, lon: 5.1214 },
            cumulative_time_seconds: 0,
            cumulative_distance_meters: 0,
            max_speed_kmh: 0
        }];
        
        const result = interpolateLocationAtTime(singlePointPath, 5);
        expect(result).toEqual({
            lat: singlePointPath[0].coordinates.lat,
            lon: singlePointPath[0].coordinates.lon
        });
    });

    it('maintains consistent interpolation for same time', () => {
        const result1 = interpolateLocationAtTime(samplePath, 5);
        const result2 = interpolateLocationAtTime(samplePath, 5);
        expect(result1).toEqual(result2);
    });

    it('interpolates along a longer path', () => {
        const longerPath: PathPoint[] = [
            { coordinates: { lat: 52.0907, lon: 5.1214 }, cumulative_time_seconds: 0, cumulative_distance_meters: 0, max_speed_kmh: 0 },
            { coordinates: { lat: 52.0905, lon: 5.1212 }, cumulative_time_seconds: 10, cumulative_distance_meters: 250, max_speed_kmh: 30 },
            { coordinates: { lat: 52.0903, lon: 5.1210 }, cumulative_time_seconds: 20, cumulative_distance_meters: 500, max_speed_kmh: 50 },
            { coordinates: { lat: 52.0901, lon: 5.1208 }, cumulative_time_seconds: 30, cumulative_distance_meters: 750, max_speed_kmh: 30 },
            { coordinates: { lat: 52.0899, lon: 5.1206 }, cumulative_time_seconds: 40, cumulative_distance_meters: 1000, max_speed_kmh: 20 }
        ];

        // Test interpolation at various points
        const result1 = interpolateLocationAtTime(longerPath, 15);
        const result2 = interpolateLocationAtTime(longerPath, 25);
        const result3 = interpolateLocationAtTime(longerPath, 35);

        expect(result1).not.toBeNull();
        expect(result2).not.toBeNull();
        expect(result3).not.toBeNull();

        if (result1 && result2 && result3) {
            // Verify that points are in correct order
            expect(result1.lat).toBeGreaterThan(result2.lat);
            expect(result2.lat).toBeGreaterThan(result3.lat);
            expect(result1.lon).toBeGreaterThan(result2.lon);
            expect(result2.lon).toBeGreaterThan(result3.lon);
        }
    });
}); 