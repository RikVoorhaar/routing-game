import type { Address } from './types';

/**
 * Formats a number as a currency string (EUR)
 * @param amount The amount to format
 * @returns Formatted currency string
 */
export function formatMoney(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
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
 * @param milliseconds Duration in milliseconds
 * @returns Formatted time string (e.g., "2h 30m 45s", "5m 30s", "45s")
 */
export function formatTimeFromMs(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
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
 * @param seconds Duration in sections
 * @returns Formatted time string (e.g., "2h 30m", "5m 30s", "45s")
 */
export function formatTimeFromSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${remainingSeconds}s`;
    }
}

/**
 * Formats weight in kg to human readable format
 * @param weight Weight in kilograms
 * @returns Formatted weight string (e.g., "1.5t", "500kg")
 */
export function formatWeight(weight: number): string {
    if (weight >= 1000) {
        return `${(weight / 1000).toFixed(1)}t`;
    }
    return `${weight}kg`;
} 