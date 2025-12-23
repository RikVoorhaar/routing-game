import { writable } from 'svelte/store';
import type { Job, ActiveJob, Address, ActiveRoute } from '$lib/server/db/schema';

// Store for the currently selected job
export const selectedJob = writable<Job | null>(null);

// New store for selected active job with complete data including routes and addresses
export interface SelectedActiveJobData {
	activeJob: ActiveJob;
	employeeStartAddress: Address;
	jobAddress: Address;
	employeeEndAddress: Address;
	activeRoute: ActiveRoute;
}

export const selectedActiveJobData = writable<SelectedActiveJobData | null>(null);

// Action to select a job
export function selectJob(job: Job | null) {
	selectedJob.set(job);
	// Clear active job data when job selection changes
	if (!job) {
		selectedActiveJobData.set(null);
	}
}

// Action to clear the selected job
export function clearSelectedJob() {
	selectedJob.set(null);
	selectedActiveJobData.set(null);
}

export function setSelectedActiveJobData(data: SelectedActiveJobData | null) {
	selectedActiveJobData.set(data);
}
