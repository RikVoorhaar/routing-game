import { writable } from 'svelte/store';
import type { Job, ActiveJob, Place, Coordinate, RoutingResult } from '$lib/server/db/schema';

// Store for the currently selected job
export const selectedJob = writable<Job | null>(null);

// New store for selected active job with complete data including routes and addresses
// Note: activeRoute is optional because routes are fetched on-demand
// Addresses can be null if not loaded yet (loaded on-demand if needed)
export interface SelectedActiveJobData {
	activeJob: ActiveJob;
	employeeStartLocation: Coordinate;
	jobPickupPlace: Place | null;
	jobDeliverPlace: Place | null;
	activeRoute?: RoutingResult | null; // RoutingResult from route computation, not ActiveRoute from DB
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
