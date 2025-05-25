import type { RequestEvent } from '@sveltejs/kit';

export async function load(event: RequestEvent) {
  // Get session using the auth() method
  const session = await event.locals.auth();
  
  // Return a properly serialized session to avoid serialization issues
  return {
    session: session ? structuredClone({
      user: session.user,
      expires: session.expires
    }) : null
  };
} 