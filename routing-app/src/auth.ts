import { SvelteKitAuth } from '@auth/sveltekit';
import Credentials from '@auth/core/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './lib/server/db';
import { nanoid } from 'nanoid';
import { users, credentials as credentialsTable } from './lib/server/db/schema';
import { hashPassword, verifyPassword } from './lib/server/auth/password';
import { eq } from 'drizzle-orm';
import type { Session } from '@auth/core/types';
import { log } from './lib/logger';

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
					// First try to find the user by username
					const userResult = await db
						.select({
							id: users.id,
							username: users.username,
							name: users.name,
							email: users.email,
							image: users.image
						})
						.from(users)
						.where(eq(users.username, typedCredentials.username));

					const foundUser = userResult?.[0];

					if (!foundUser) {
						log.auth.warn({
							event: 'auth.login.failed',
							reason: 'user_not_found',
							username: typedCredentials.username
						}, 'Login failed: User not found');
						return null;
					}

					// Find credential record for the user
					const credentialResult = await db
						.select({
							id: credentialsTable.id,
							userId: credentialsTable.userId,
							hashedPassword: credentialsTable.hashedPassword
						})
						.from(credentialsTable)
						.where(eq(credentialsTable.userId, foundUser.id));

					const userCredential = credentialResult?.[0];

					// Check if we have credentials in the credentials table
					if (userCredential) {
						const isValid = await verifyPassword(
							typedCredentials.password,
							userCredential.hashedPassword
						);

						if (!isValid) {
							log.auth.warn({
								event: 'auth.login.failed',
								reason: 'invalid_password',
								user_id: foundUser.id,
								username: foundUser.username
							}, 'Login failed: Invalid password');
							return null;
						}

						log.auth.info({
							event: 'auth.login.success',
							user_id: foundUser.id,
							username: foundUser.username
						}, 'Login successful');
					} else {
						log.auth.warn({
							event: 'auth.login.failed',
							reason: 'no_credentials',
							user_id: foundUser.id,
							username: foundUser.username
						}, 'Login failed: No credentials found');
						return null;
					}

					// Return the user object for the session
					return {
						id: foundUser.id,
						name: foundUser.name || foundUser.username,
						email: foundUser.email,
						image: foundUser.image
					};
				} catch (error) {
					log.auth.error({
						event: 'auth.login.error',
						username: typedCredentials.username,
						err: error instanceof Error ? {
							name: error.name,
							message: error.message,
							stack: error.stack
						} : error
					}, 'Login error');
					return null;
				}
			}
		})
	],
	session: {
		strategy: 'jwt',
		maxAge: 30 * 24 * 60 * 60 // 30 days
	},
	secret: process.env.AUTH_SECRET || 'SUPER_SECRET_DO_NOT_USE_THIS_IN_PRODUCTION',
	trustHost: true,
	debug: process.env.NODE_ENV === 'development',
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
	const existingUserResult = await db
		.select({
			id: users.id,
			username: users.username
		})
		.from(users)
		.where(eq(users.username, username));

	const existingUser = existingUserResult?.[0];
	if (existingUser) {
		throw new Error('Username already exists');
	}

	if (email) {
		const existingEmailResult = await db
			.select({
				id: users.id,
				email: users.email
			})
			.from(users)
			.where(eq(users.email, email));

		const existingEmail = existingEmailResult?.[0];
		if (existingEmail) {
			throw new Error('Email already exists');
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
	await db.insert(credentialsTable).values({
		id: nanoid(),
		userId,
		hashedPassword
	});

	log.auth.info({
		event: 'auth.user.created',
		user_id: userId,
		username,
		email
	}, 'User registered');
	return { userId };
}
