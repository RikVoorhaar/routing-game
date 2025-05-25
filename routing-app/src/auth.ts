import { SvelteKitAuth } from "@auth/sveltekit";
import Credentials from "@auth/core/providers/credentials";

console.log('Initializing Auth.js...');

// Initialize Auth.js
const auth = SvelteKitAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('Authorize called with credentials:', credentials);
        if (credentials?.username === 'testuser' && credentials?.password === 'password123') {
          return { id: "1", name: "Test User", email: "test@example.com" };
        }
        return null;
      }
    })
  ],
  secret: "SUPER_SECRET_DO_NOT_USE_THIS_IN_PRODUCTION",
  trustHost: true,
  debug: true,
  // Explicitly define session configuration
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  }
});

// Log what Auth.js provides
console.log('Auth.js exported properties:', Object.keys(auth));

export const { handle, signIn, signOut } = auth; 