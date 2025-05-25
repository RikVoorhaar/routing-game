import type { RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent) {
  console.log('=== Layout load function called ===');
  console.log('Event locals keys:', Object.keys(event.locals));
  console.log('Auth type:', typeof event.locals.auth);

  // Get session from event.locals
  const session = await event.locals.getSession();
  
  // Debug session content
  console.log('Session before serialization:', session);
  
  // Add debugger statement to pause execution
  debugger;
  // Return a simplified version of the session to avoid serialization issues
  return {
    session: session ? { 
      // Only include serializable properties
      user: session.user,
      expires: session.expires
    } : null
  };
} 