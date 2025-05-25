import type { RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent) {
  console.log('=== Layout load function called ===');
  console.log('Event locals keys:', Object.keys(event.locals));
  console.log('Auth type:', typeof event.locals.auth);

  // Get session using the auth() method instead of getSession()
  const session = await event.locals.auth();
  
  // Debug session content
  console.log('Session before serialization:', session);
  
  // Return a properly serialized session to avoid serialization issues
  // Using structuredClone to ensure we get a serializable version
  return {
    session: session ? structuredClone({
      user: session.user,
      expires: session.expires
    }) : null
  };
} 