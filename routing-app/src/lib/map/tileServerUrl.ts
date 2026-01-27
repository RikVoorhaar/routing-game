/**
 * Base URL for the Martin tile server.
 * Default: http://localhost:3000 (Martin's default port).
 * Override via VITE_TILE_SERVER_URL (e.g. https://tiles.tramp.land for production).
 */
export function getTileServerUrl(): string {
	return (typeof import.meta.env !== 'undefined' &&
		typeof import.meta.env.VITE_TILE_SERVER_URL === 'string' &&
		import.meta.env.VITE_TILE_SERVER_URL.trim() !== ''
		? import.meta.env.VITE_TILE_SERVER_URL.replace(/\/$/, '')
		: 'http://localhost:3000') as string;
}
