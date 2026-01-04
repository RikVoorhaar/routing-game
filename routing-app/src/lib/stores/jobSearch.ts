import { writable, derived } from 'svelte/store';
import type { Job, ActiveJob } from '$lib/server/db/schema';

/**
 * Search result for a single job
 */
export interface JobSearchResult {
	job: Job;
	activeJob: ActiveJob;
}

/**
 * Search results keyed by employee ID
 */
type SearchResultsByEmployee = Record<string, JobSearchResult[]>;

/**
 * Store holding job search results per employee
 */
const searchResultsByEmployeeId = writable<SearchResultsByEmployee>({});

/**
 * Actions for managing job search results
 */
export const jobSearchActions = {
	/**
	 * Set search results for an employee
	 */
	setSearchResults(employeeId: string, results: JobSearchResult[]) {
		searchResultsByEmployeeId.update((current) => ({
			...current,
			[employeeId]: results
		}));
	},

	/**
	 * Clear search results for an employee
	 */
	clearSearchResults(employeeId: string) {
		searchResultsByEmployeeId.update((current) => {
			const updated = { ...current };
			delete updated[employeeId];
			return updated;
		});
	},

	/**
	 * Clear all search results
	 */
	clearAll() {
		searchResultsByEmployeeId.set({});
	}
};

/**
 * Get search results for a specific employee
 */
export const getSearchResultsForEmployee = (employeeId: string) => {
	return derived(searchResultsByEmployeeId, ($results) => $results[employeeId] || []);
};

/**
 * Get all search results (for map rendering)
 */
const allSearchResults = derived(searchResultsByEmployeeId, ($results) => {
	// Flatten all results into a single array
	const allResults: JobSearchResult[] = [];
	for (const results of Object.values($results)) {
		allResults.push(...results);
	}
	return allResults;
});

/**
 * Get all jobs from search results (for map markers)
 */
export const allSearchResultJobs = derived(allSearchResults, ($allResults) => {
	return $allResults.map((r) => r.job);
});
