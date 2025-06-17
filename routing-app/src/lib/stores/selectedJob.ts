import { writable } from 'svelte/store';
import type { InferSelectModel } from 'drizzle-orm';
import type { jobs } from '$lib/server/db/schema';

type Job = InferSelectModel<typeof jobs>;

// Store for the currently selected job
export const selectedJob = writable<Job | undefined>(undefined);

// Action to select a job
export function selectJob(job: Job | undefined) {
    selectedJob.set(job);
}

// Action to clear the selected job
export function clearSelectedJob() {
    selectedJob.set(undefined);
} 