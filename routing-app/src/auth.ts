import { SvelteKitAuth } from "@auth/sveltekit";
import Credentials from "@auth/core/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./lib/server/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { user, credential } from "./lib/server/db/schema";
import { hashPassword, verifyPassword } from "./lib/server/auth/password";

console.log('Initializing Auth.js...');

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
        if (!credentials?.username || !credentials?.password) {
          console.log('Missing credentials');
          return null;
        }
        
        console.log('Authorize called with username:', credentials.username);
        
        try {
          // First try to find the user by username
          const [foundUser] = await db
            .select()
            .from(user)
            .where(eq(user.username, credentials.username));
          
          if (!foundUser) {
            console.log('User not found');
            return null;
          }
          
          // Find credential record for the user
          const [userCredential] = await db
            .select()
            .from(credential)
            .where(eq(credential.userId, foundUser.id));
          
          // If we have credentials in the new table, use that
          if (userCredential) {
            const isValid = await verifyPassword(
              credentials.password,
              userCredential.hashedPassword
            );
            
            if (!isValid) {
              console.log('Invalid password (credential table)');
              return null;
            }
          } 
          // Otherwise fall back to the legacy password field in the user table
          else if (foundUser.passwordHash) {
            // Note: This assumes the legacy passwords used the same hashing method
            // If they used a different hash, you would need to adjust this logic
            const isValid = await verifyPassword(
              credentials.password,
              foundUser.passwordHash
            );
            
            if (!isValid) {
              console.log('Invalid password (legacy)');
              return null;
            }
            
            // Migrate the password to the new credential table
            await db.insert(credential).values({
              id: nanoid(),
              userId: foundUser.id,
              hashedPassword: foundUser.passwordHash,
            });
          } else {
            console.log('No password found for user');
            return null;
          }
          
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
    strategy: "database",
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
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
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
  const [existingUser] = await db
    .select()
    .from(user)
    .where(eq(user.username, username));
  
  if (existingUser) {
    throw new Error("Username already exists");
  }
  
  if (email) {
    const [existingEmail] = await db
      .select()
      .from(user)
      .where(eq(user.email, email));
    
    if (existingEmail) {
      throw new Error("Email already exists");
    }
  }
  
  // Hash the password
  const hashedPassword = await hashPassword(password);
  
  // Create user ID
  const userId = nanoid();
  
  // Create user record
  await db.insert(user).values({
    id: userId,
    username,
    email,
    name
  });
  
  // Create credential record
  await db.insert(credential).values({
    id: nanoid(),
    userId,
    hashedPassword
  });
  
  return { userId };
} 