import { json } from '@sveltejs/kit';
import { getJobsInTile } from '$lib/generateJobs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	try {
		// Parse tile coordinates from URL parameters
		const z = parseInt(params.z);
		const x = parseInt(params.x);  
		const y = parseInt(params.y);

		// Validate parameters
		if (isNaN(z) || isNaN(x) || isNaN(y)) {
			return json(
				{ error: 'Invalid tile coordinates. z, x, and y must be valid integers.' },
				{ status: 400 }
			);
		}

		// Validate zoom level (typical web map zoom levels are 0-20)
		if (z < 0 || z > 20) {
			return json(
				{ error: 'Invalid zoom level. z must be between 0 and 20.' },
				{ status: 400 }
			);
		}

		// Get optional limit parameter from query string (default 100)
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam) : 100;

		if (limitParam && (isNaN(limit) || limit < 1 || limit > 1000)) {
			return json(
				{ error: 'Invalid limit. Must be a number between 1 and 1000.' },
				{ status: 400 }
			);
		}

		// Get jobs within the specified tile
		const jobs = await getJobsInTile(x, y, z, limit);

		// Return jobs with metadata
		return json({
			success: true,
			tile: { x, y, z },
			count: jobs.length,
			limit,
			jobs
		});

	} catch (error) {
		console.error('Error fetching jobs for tile:', error);
		return json(
			{ error: 'Failed to fetch jobs for the specified tile' },
			{ status: 500 }
		);
	}
}; 