import { describe, it, expect, beforeAll } from 'vitest';
import { getRandomAddressInAnnulus } from '../addresses';
import { getClosestAddress, getServerHealth, getAddressBbox, getNumAddresses, getAddressSample } from '../server';
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
    
    describe('getClosestAddress - house number bug reproduction', () => {
        it('should return addresses with house numbers when available', async () => {
            // Test with a coordinate in Utrecht city center where we expect addresses with house numbers
            const location: Coordinate = { lat: 52.0907, lon: 5.1214 }; // Domplein area
            
            const address = await getClosestAddress(location);
            
            // Verify basic address structure
            expect(address).toHaveProperty('id');
            expect(address).toHaveProperty('lat');
            expect(address).toHaveProperty('lon');
            expect(typeof address.lat).toBe('number');
            expect(typeof address.lon).toBe('number');
            
            // Check for address fields - these should be present
            expect(address).toHaveProperty('street');
            expect(address).toHaveProperty('house_number');
            expect(address).toHaveProperty('city');
            expect(address).toHaveProperty('postcode');
            
            console.log('Address returned:', address);
            
            // BUG REPRODUCTION: Check if house number is actually populated
            // This should pass once we fix the bug
            if (address.street && address.street.length > 0) {
                // If we have a street name, we should often have a house number too
                // This assertion may fail due to the bug - that's expected for now
                expect(address.house_number).toBeDefined();
                
                // Log for debugging
                console.log(`Street: "${address.street}", House number: "${address.house_number}"`);
                
                // The house number should not be empty string if we have address data
                if (address.house_number !== undefined) {
                    expect(typeof address.house_number).toBe('string');
                }
            }
        });
        
        it('should return the same field names as expected by the frontend', async () => {
            const location: Coordinate = { lat: 52.0907, lon: 5.1214 };
            const address = await getClosestAddress(location);
            
            // Check that the API returns the field names that the frontend expects
            // The Address interface expects 'house_number' but the server might be returning 'housenumber'
            console.log('Full address object keys:', Object.keys(address));
            console.log('Full address object:', JSON.stringify(address, null, 2));
            
            // The frontend expects these exact field names
            expect(address).toHaveProperty('house_number'); // NOT 'housenumber'
            
            // Test multiple addresses to see the pattern
            const locations = [
                { lat: 52.0907, lon: 5.1214 },
                { lat: 52.0900, lon: 5.1200 },
                { lat: 52.0910, lon: 5.1220 }
            ];
            
            for (const loc of locations) {
                const addr = await getClosestAddress(loc);
                console.log(`Address at (${loc.lat}, ${loc.lon}):`, {
                    street: addr.street,
                    house_number: addr.house_number,
                    housenumber: (addr as any).housenumber, // Check if server is returning this instead
                    city: addr.city
                });
            }
        });
        
        it('should test the direct API endpoint response format', async () => {
            // Test the API directly to see exactly what format it returns
            const response = await fetch(`http://localhost:8050/api/v1/closest_address?location=52.0907,5.1214`);
            expect(response.ok).toBe(true);
            
            const rawData = await response.json();
            console.log('Raw API response:', JSON.stringify(rawData, null, 2));
            
            // Check what field names the API actually returns
            expect(rawData).toHaveProperty('id');
            expect(rawData).toHaveProperty('lat');
            expect(rawData).toHaveProperty('lon');
            expect(rawData).toHaveProperty('street');
            
            // This is the key test - what field name does the API return for house number?
            if (rawData.housenumber !== undefined) {
                console.log('API returns "housenumber":', rawData.housenumber);
            }
            if (rawData.house_number !== undefined) {
                console.log('API returns "house_number":', rawData.house_number);
            }
        });
    });
    
    describe('new API endpoints', () => {
        describe('getAddressBbox', () => {
            it('should return the bounding box of all addresses', async () => {
                const bbox = await getAddressBbox();
                
                // Check bbox structure
                expect(bbox).toHaveProperty('min_lat');
                expect(bbox).toHaveProperty('max_lat');
                expect(bbox).toHaveProperty('min_lon');
                expect(bbox).toHaveProperty('max_lon');
                
                // Check that coordinates are numbers
                expect(typeof bbox.min_lat).toBe('number');
                expect(typeof bbox.max_lat).toBe('number');
                expect(typeof bbox.min_lon).toBe('number');
                expect(typeof bbox.max_lon).toBe('number');
                
                // Check that bbox is valid (max > min)
                expect(bbox.max_lat).toBeGreaterThan(bbox.min_lat);
                expect(bbox.max_lon).toBeGreaterThan(bbox.min_lon);
                
                console.log('Address bbox:', bbox);
            });
        });
        
        describe('getNumAddresses', () => {
            it('should return the total number of addresses', async () => {
                const result = await getNumAddresses();
                
                // Check result structure
                expect(result).toHaveProperty('count');
                expect(typeof result.count).toBe('number');
                expect(result.count).toBeGreaterThan(0);
                
                console.log('Total addresses:', result.count);
            });
        });
        
        describe('getAddressSample', () => {
            it('should return a sample of addresses with pagination', async () => {
                const params = {
                    number: 50,
                    seed: 123,
                    page_size: 10,
                    page_num: 0
                };
                
                const result = await getAddressSample(params);
                
                // Check result structure
                expect(result).toHaveProperty('addresses');
                expect(result).toHaveProperty('pagination');
                expect(Array.isArray(result.addresses)).toBe(true);
                
                // Check pagination info
                expect(result.pagination.page_num).toBe(params.page_num);
                expect(result.pagination.page_size).toBe(params.page_size);
                expect(result.pagination.total_requested).toBe(params.number);
                expect(result.pagination.returned).toBe(result.addresses.length);
                
                // Should return up to page_size addresses
                expect(result.addresses.length).toBeLessThanOrEqual(params.page_size);
                expect(result.addresses.length).toBeGreaterThan(0);
                
                // Check address structure
                for (const address of result.addresses) {
                    expect(address).toHaveProperty('id');
                    expect(address).toHaveProperty('lat');
                    expect(address).toHaveProperty('lon');
                    expect(address).toHaveProperty('street');
                    expect(address).toHaveProperty('house_number');
                    expect(address).toHaveProperty('city');
                    expect(address).toHaveProperty('postcode');
                    
                    expect(typeof address.lat).toBe('number');
                    expect(typeof address.lon).toBe('number');
                }
                
                console.log(`Address sample: returned ${result.addresses.length} addresses`);
            });
            
            it('should handle pagination correctly', async () => {
                const params = {
                    number: 30,
                    seed: 456,
                    page_size: 10,
                    page_num: 1  // Second page
                };
                
                const result = await getAddressSample(params);
                
                expect(result.pagination.page_num).toBe(1);
                expect(result.addresses.length).toBeLessThanOrEqual(10);
            });
            
            it('should return consistent results with same seed', async () => {
                const params1 = {
                    number: 20,
                    seed: 789,
                    page_size: 5,
                    page_num: 0
                };
                
                const params2 = {
                    number: 20,
                    seed: 789,  // Same seed
                    page_size: 5,
                    page_num: 0
                };
                
                const result1 = await getAddressSample(params1);
                const result2 = await getAddressSample(params2);
                
                // Should return the same addresses in the same order
                expect(result1.addresses.length).toBe(result2.addresses.length);
                
                for (let i = 0; i < result1.addresses.length; i++) {
                    expect(result1.addresses[i].id).toBe(result2.addresses[i].id);
                }
            });
            
            it('should handle edge cases', async () => {
                // Test with page beyond available data
                const params = {
                    number: 10,
                    seed: 999,
                    page_size: 5,
                    page_num: 10  // Way beyond available data
                };
                
                const result = await getAddressSample(params);
                expect(result.addresses.length).toBe(0);
            });
            
            it('should validate input parameters', async () => {
                // Test with invalid parameters
                await expect(getAddressSample({
                    number: 0,  // Invalid
                    seed: 1,
                    page_size: 10,
                    page_num: 0
                })).rejects.toThrow();
                
                await expect(getAddressSample({
                    number: 10,
                    seed: 1,
                    page_size: 0,  // Invalid
                    page_num: 0
                })).rejects.toThrow();
            });
        });
    });
}); 