import { SvelteKitAuth } from "@auth/sveltekit";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import CredentialsProvider from "@auth/core/providers/credentials";
import * as argon2 from "@node-rs/argon2";
import { db } from "$lib/server/db";
import { user, session } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { Handle } from "@sveltejs/kit";

const auth = SvelteKitAuth({
  adapter: DrizzleAdapter(db),
  secret: process.env.AUTH_SECRET || "DEFAULT_SECRET_CHANGE_THIS_IN_PRODUCTION",
  session: {
    strategy: "database",
    generateSessionToken: () => {
      return crypto.randomUUID();
    }
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const username = credentials.username as string;
        const password = credentials.password as string;

        const userRecord = await db.query.user.findFirst({
          where: eq(user.username, username)
        });

        if (!userRecord) {
          return null;
        }

        const passwordMatches = await argon2.verify(
          userRecord.passwordHash,
          password
        );

        if (!passwordMatches) {
          return null;
        }

        return {
          id: userRecord.id,
          username: userRecord.username
        };
      }
    })
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    }
  }
});

export const { handle, signIn, signOut } = auth; 