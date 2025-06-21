import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users, credentials } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function POST() {
	try {
		// Check if test user already exists
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.username, 'testuser'))
			.limit(1);

		if (existingUser.length > 0) {
			return json({
				success: true,
				message: 'Test user already exists',
				user: {
					id: existingUser[0].id,
					username: existingUser[0].username
				}
			});
		}

		// Create password hash
		const hashedPassword = await hashPassword('password123');
		const userId = nanoid();

		// Insert test user
		const [newUser] = await db
			.insert(users)
			.values({
				id: userId,
				username: 'testuser',
				name: 'Test User',
				email: 'test@example.com'
			})
			.returning();

		// Insert credentials
		await db.insert(credentials).values({
			id: nanoid(),
			userId: userId,
			hashedPassword
		});

		return json({
			success: true,
			message: 'Test user created successfully',
			user: {
				id: newUser.id,
				username: newUser.username
			}
		});
	} catch (error) {
		console.error('Error creating test user:', error);
		return json(
			{
				success: false,
				message: 'Failed to create test user',
				error: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
