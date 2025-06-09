import { handle as authHandle } from './auth';
import type { Handle } from '@sveltejs/kit';

// Debug wrapper around the original handle
export const handle: Handle = async ({ event, resolve }) => {
	// Handle Chrome DevTools requests silently - just return 404 without logging
	if (event.url.pathname.startsWith('/.well-known/appspecific/com.chrome.devtools.json')) {
		return new Response('', { status: 404 });
	}

	// Only log authentication errors, not Chrome DevTools requests
	try {
		return await authHandle({ event, resolve });
	} catch (error) {
		// Don't log Chrome DevTools related errors
		if (!error?.message?.includes('chrome.devtools')) {
			console.error('Authentication error:', error);
		}
		throw error;
	}
};
