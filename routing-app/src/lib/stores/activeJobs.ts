import { writable, derived } from 'svelte/store';
import type { InferSelectModel } from 'drizzle-orm';
import type { activeJobs } from '$lib/server/db/schema';

export type ActiveJob = InferSelectModel<typeof activeJobs>;

// Store for cached active jobs (keyed by job ID)
export const cachedActiveJobs = writable<Record<number, ActiveJob[]>>({});

// Store for the currently selected active job
export const selectedActiveJob = writable<ActiveJob | null>(null);

// Action to cache active jobs for a specific job ID
export function cacheActiveJobsForJob(jobId: number, activeJobsList: ActiveJob[]) {
	cachedActiveJobs.update((cache) => ({
		...cache,
		[jobId]: activeJobsList
	}));
}

// Action to select an active job
export function selectActiveJob(activeJob: ActiveJob | null) {
	selectedActiveJob.set(activeJob);
}

// Action to clear the selected active job
export function clearSelectedActiveJob() {
	selectedActiveJob.set(null);
}

// Action to clear cached active jobs for a specific job
export function clearCachedActiveJobsForJob(jobId: number) {
	cachedActiveJobs.update((cache) => {
		const newCache = { ...cache };
		delete newCache[jobId];
		return newCache;
	});
}

// Derived store to get active jobs for the currently selected job (if any)
export const activeJobsForSelectedJob = derived(
	[selectedActiveJob, cachedActiveJobs],
	([$selectedActiveJob, $cachedActiveJobs]) => {
		if (!$selectedActiveJob?.jobId) return [];
		return $cachedActiveJobs[$selectedActiveJob.jobId] || [];
	}
);
