import { handle as authHandle } from './auth';

// Debug wrapper around the original handle
export const handle = async ({ event, resolve }) => {
  // Only log authentication errors
  try {
    return await authHandle({ event, resolve });
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
};
