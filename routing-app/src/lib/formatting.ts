import type { Address } from './types';

/**
 * Formats a number as a currency string (EUR)
 * @param amount The amount to format (can be number or string)
 * @returns Formatted currency string
 */
export function formatMoney(amount: number | string): string {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numericAmount);
}

/**
 * Formats an address object into a readable string
 * @param address The address object to format
 * @returns Formatted address string
 */
export function formatAddress(address: Address): string {
    const parts = [];
    if (address.street) parts.push(address.street);
    if (address.house_number) parts.push(address.house_number);
    if (address.city) parts.push(address.city);
    return parts.join(' ') || `${address.lat.toFixed(4)}, ${address.lon.toFixed(4)}`;
}

/**
 * Formats time duration in milliseconds to human readable format
 * @param milliseconds Duration in milliseconds (can be float)
 * @returns Formatted time string (e.g., "2h 30m 45s", "5m 30s", "45s")
 */
export function formatTimeFromMs(milliseconds: number): string {
    const totalSeconds = Math.round(milliseconds / 1000); // Round to nearest integer
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Formats time duration in seconds to human readable format
 * @param seconds Duration in seconds (can be float)
 * @returns Formatted time string (e.g., "2h 30m", "25m", "45s")
 */
export function formatTimeFromSeconds(seconds: number): string {
    const totalSeconds = Math.round(seconds); // Round to nearest integer
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
        // For hours, only show minutes if there are any, no seconds
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    } else if (minutes > 0) {
        // For minutes, round to nearest minute unless it's less than 1 minute
        return `${minutes}m`;
    } else {
        // Only show seconds for very short durations
        return `${remainingSeconds}s`;
    }
}

/**
 * Formats route duration for route cards - shows minutes and seconds with floored seconds
 * @param seconds Duration in seconds (can be float)
 * @returns Formatted time string (e.g., "2h 30m", "25m 34s", "45s")
 */
export function formatRouteDuration(seconds: number): string {
    const totalSeconds = Math.floor(seconds); // Floor to remove decimals
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
        // For hours, only show minutes (no seconds for readability)
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    } else if (minutes > 0) {
        // Show minutes and seconds
        return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
        // Show seconds only
        return `${remainingSeconds}s`;
    }
}

/**
 * Formats weight in kg to human readable format
 * @param weight Weight in kilograms (can be number or string)
 * @returns Formatted weight string (e.g., "1.5t", "500kg")
 */
export function formatWeight(weight: number | string): string {
    const numericWeight = typeof weight === 'string' ? parseFloat(weight) : weight;
    if (numericWeight >= 1000) {
        return `${(numericWeight / 1000).toFixed(1)}t`;
    }
    return `${numericWeight}kg`;
} 