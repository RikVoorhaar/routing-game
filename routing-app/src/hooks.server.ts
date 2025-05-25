import { handle as authHandle } from './auth';

// Debug wrapper around the original handle
export const handle = async ({ event, resolve }) => {
  console.log('=== Handle hook called ===');
  console.log('Event locals before auth:', Object.keys(event.locals || {}));
  
  try {
    const result = await authHandle({ event, resolve });
    console.log('Auth handle completed');
    console.log('Event locals after auth:', Object.keys(event.locals || {}));
    console.log('Auth type:', typeof event.locals?.auth);
    return result;
  } catch (error) {
    console.error('Error in auth handle:', error);
    throw error;
  }
};
