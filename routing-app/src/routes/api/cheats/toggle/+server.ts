import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// POST /api/cheats/toggle - Toggle user's cheat permissions
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();

	if (!session?.user?.id) {
		return error(401, 'Unauthorized');
	}

	try {
		const { enabled } = await request.json();

		if (typeof enabled !== 'boolean') {
			return error(400, 'Invalid enabled value - must be boolean');
		}

		// Update user's cheat status
		await db.update(users).set({ cheatsEnabled: enabled }).where(eq(users.id, session.user.id));

		return json({
			success: true,
			message: `Cheats ${enabled ? 'enabled' : 'disabled'}`,
			cheatsEnabled: enabled
		});
	} catch (err) {
		console.error('Error toggling cheats:', err);
		return error(500, 'Failed to update cheats setting');
	}
};
