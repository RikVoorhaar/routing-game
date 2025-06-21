import { json } from '@sveltejs/kit';
import { createUser } from '../../../auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();

		// Validate required fields
		if (!data.username || !data.password) {
			return json({ error: 'Username and password are required' }, { status: 400 });
		}

		// Validate password strength (basic example)
		if (data.password.length < 8) {
			return json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
		}

		// Create the user
		const result = await createUser({
			username: data.username,
			password: data.password,
			email: data.email,
			name: data.name
		});

		return json({ success: true, userId: result.userId });
	} catch (error) {
		console.error('Error creating user:', error);

		// Handle specific errors
		if (error instanceof Error) {
			if (error.message.includes('already exists')) {
				return json({ error: error.message }, { status: 409 }); // Conflict
			}
		}

		return json({ error: 'Failed to create user' }, { status: 500 });
	}
};
