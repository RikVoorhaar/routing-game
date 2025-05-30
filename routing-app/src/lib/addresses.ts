import type { Address, Coordinate } from './types';
import { randomCoordinateInAnnulus } from './geo';
import { getClosestAddress } from './server';

/**
 * Get a random address within an annulus around a center point
 * @param center Center point of the annulus
 * @param minDistance Minimum distance from center in kilometers
 * @param maxDistance Maximum distance from center in kilometers
 * @returns Random address within the annulus
 * @throws Error if distances are invalid (negative or min > max)
 */
export async function getRandomAddressInAnnulus(
    center: Coordinate,
    minDistance: number,
    maxDistance: number
): Promise<Address> {
    // Validate inputs
    if (minDistance < 0) {
        throw new Error('Minimum distance cannot be negative');
    }
    if (maxDistance <= minDistance) {
        throw new Error('Maximum distance must be greater than minimum distance');
    }
    
    // Generate random point in annulus
    const randomPoint = randomCoordinateInAnnulus(center, minDistance, maxDistance);
    
    // Get closest address to random point
    return getClosestAddress(randomPoint);
} 