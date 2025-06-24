import { json } from '@sveltejs/kit';
import { getJobsInTile } from '$lib/jobs/queryJobs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const { z, x, y } = params;

		// Parse and validate tile coordinates
		const zoomLevel = parseInt(z, 10);
		const tileX = parseInt(x, 10);
		const tileY = parseInt(y, 10);

		if (isNaN(zoomLevel) || isNaN(tileX) || isNaN(tileY)) {
			return json({ error: 'Invalid tile coordinates' }, { status: 400 });
		}

		// Validate zoom level (reasonable range)
		if (zoomLevel < 1 || zoomLevel > 18) {
			return json({ error: 'Zoom level must be between 1 and 18' }, { status: 400 });
		}

		// Get jobs for this tile
		const jobs = await getJobsInTile(tileX, tileY, zoomLevel, 50); // Limit to 50 jobs per tile

		return json({
			tile: { z: zoomLevel, x: tileX, y: tileY },
			jobs,
			count: jobs.length
		});
	} catch (error) {
		console.error('Error fetching jobs for tile:', error);
		return json({ error: 'Failed to fetch jobs' }, { status: 500 });
	}
};
