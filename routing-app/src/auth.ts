import { SvelteKitAuth } from "@auth/sveltekit";
import Credentials from "@auth/core/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./lib/server/db";
import { nanoid } from "nanoid";
import { users, credentials } from "./lib/server/db/schema";
import { hashPassword, verifyPassword } from "./lib/server/auth/password";
import type { Session } from "@auth/core/types";

// Type definition for credentials
interface CredentialsType {
  username: string;
  password: string;
}

// Define types for session
interface SessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SessionType extends Session {
  user?: SessionUser;
  error?: string;
  accessToken?: string;
}

// Initialize Auth.js
const auth = SvelteKitAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Credentials({
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const typedCredentials = credentials as CredentialsType;
        
        if (!typedCredentials?.username || !typedCredentials?.password) {
          return null;
        }
        
        try {
          console.log('=== AUTHENTICATION DEBUG ===');
          console.log('Username:', typedCredentials.username);
          console.log('Password length:', typedCredentials.password?.length);
          
          // First try to find the user by username
          const userResult = await db.run(`
            SELECT id, username, name, email, image 
            FROM user 
            WHERE username = ?
          `, [typedCredentials.username]);
          
          console.log('User query result:', userResult);
          console.log('User rows:', userResult.rows);
          
          const foundUser = userResult.rows?.[0];
          console.log('Found user:', foundUser);
          
          if (!foundUser) {
            console.log('No user found with username:', typedCredentials.username);
            return null;
          }
          
          // Find credential record for the user
          const credentialResult = await db.run(`
            SELECT id, user_id, hashed_password 
            FROM credential 
            WHERE user_id = ?
          `, [foundUser.id]);
          
          console.log('Credential query result:', credentialResult);
          console.log('Credential rows:', credentialResult.rows);
          
          const userCredential = credentialResult.rows?.[0];
          console.log('Found credential:', userCredential);
          
          // Check if we have credentials in the credentials table
          if (userCredential) {
            console.log('Verifying password...');
            const isValid = await verifyPassword(
              typedCredentials.password,
              userCredential.hashed_password
            );
            
            console.log('Password valid:', isValid);
            
            if (!isValid) {
              console.log('Password verification failed');
              return null;
            }

            console.log(`User authenticated successfully: ${foundUser.username}`);
          } else {
            console.log('No credentials found for user:', foundUser.id);
            return null;
          }
          
          console.log('Returning user object for session');
          // Return the user object for the session
          return {
            id: foundUser.id,
            name: foundUser.name || foundUser.username,
            email: foundUser.email,
            image: foundUser.image,
          };
        } catch (error) {
          console.error('Error during authentication:', error);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.AUTH_SECRET || "SUPER_SECRET_DO_NOT_USE_THIS_IN_PRODUCTION",
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/login' // Error code passed in query string as ?error=
  },
  callbacks: {
    async jwt({ token, user }) {
      // Add user ID to the token when it's first created
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Create a properly typed session object
      const typedSession = session as SessionType;
      
      // Add user ID to the session from the token
      if (typedSession.user) {
        typedSession.user.id = token.userId as string;
      }
      
      // Add error information if available
      if (token.error) {
        typedSession.error = token.error as string;
      }
      
      return typedSession;
    }
  }
});

// Export Auth.js functions
export const { handle, signIn, signOut } = auth;

// Utility function to create a new user with secure password
export async function createUser({
  username,
  password,
  email,
  name
}: {
  username: string;
  password: string;
  email?: string;
  name?: string;
}) {
  // Check if user already exists
  const existingUserResult = await db.run(`
    SELECT id, username 
    FROM user 
    WHERE username = ?
  `, [username]);
  
  const existingUser = existingUserResult.rows?.[0];
  if (existingUser) {
    throw new Error("Username already exists");
  }
  
  if (email) {
    const existingEmailResult = await db.run(`
      SELECT id, email 
      FROM user 
      WHERE email = ?
    `, [email]);
    
    const existingEmail = existingEmailResult.rows?.[0];
    if (existingEmail) {
      throw new Error("Email already exists");
    }
  }
  
  // Hash the password
  const hashedPassword = await hashPassword(password);
  
  // Create user ID
  const userId = nanoid();
  
  // Create user record
  await db.insert(users).values({
    id: userId,
    username,
    email,
    name
  });
  
  // Create credential record
  await db.insert(credentials).values({
    id: nanoid(),
    userId,
    hashedPassword
  });
  
  console.log(`User registered: ${username}`);
  return { userId };
} 