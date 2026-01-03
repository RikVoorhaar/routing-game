import { writable } from 'svelte/store';

/**
 * Maximum zoom level at which hover highlight and tooltip are active
 */
export const NUTS_HOVER_MAX_ZOOM = 8;

/**
 * NUTS level to display (2 = NUTS 2 regions)
 */
export const NUTS_LEVEL = 2;

/**
 * Whether the regions overlay is enabled
 */
export const regionOverlayEnabled = writable<boolean>(false);
