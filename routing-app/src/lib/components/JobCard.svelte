<script lang="ts">
	import {
		selectedJob,
		clearSelectedJob,
		selectedActiveJobData,
		setSelectedActiveJobData
	} from '$lib/stores/selectedJob';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import {
		employees,
		currentGameState,
		gameDataAPI,
		gameDataActions,
		fullEmployeeData
	} from '$lib/stores/gameData';
	import { get } from 'svelte/store';
	import { getCategoryName, getTierColor } from '$lib/jobs/jobCategories';
	import { formatCurrency, formatDistance, formatDuration } from '$lib/formatting';
	import { addError } from '$lib/stores/errors';
	import type { Employee, Job, Address } from '$lib/server/db/schema';
	import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
	import { config } from '$lib/stores/config';
	import { getSearchResultsForEmployee, jobSearchActions } from '$lib/stores/jobSearch';
	import { getRoute } from '$lib/stores/routeCache';

	let isAcceptingJob = false;
	let isLoadingRoute = false;
	let jobPickupAddress: Address | null = null;
	let jobDeliverAddress: Address | null = null;

	// Get search results for the selected employee
	$: searchResults = $selectedEmployee ? getSearchResultsForEmployee($selectedEmployee) : null;

	// Find the active job for the selected job from search results
	$: currentActiveJob =
		$selectedJob && $searchResults
			? $searchResults.find((r) => r.job.id === $selectedJob.id)?.activeJob || null
			: null;

	// Get the selected employee's data
	$: selectedEmployeeData = $selectedEmployee
		? $fullEmployeeData.find((fed) => fed.employee.id === $selectedEmployee)
		: null;

	// Track if we've already loaded details for this job
	let loadedJobId: number | null = null;

	// When job is selected, fetch route (lazy load route only when needed)
	$: if (
		$selectedJob &&
		currentActiveJob &&
		currentActiveJob.id &&
		loadedJobId !== $selectedJob.id &&
		!isLoadingRoute
	) {
		loadedJobId = $selectedJob.id;
		loadJobDetails();
	}

	// Reset loaded job ID when job changes
	$: if (!$selectedJob) {
		loadedJobId = null;
	}

	async function loadJobDetails() {
		if (!$selectedJob || !currentActiveJob || !$currentGameState || !$selectedEmployee) return;

		try {
			// Fetch route data on-demand (only when job is clicked/selected)
			isLoadingRoute = true;
			const routeData = await getRoute(currentActiveJob.id);

			if (routeData) {
				// Fetch updated active job to get the computed durationSeconds
				try {
					const updatedActiveJobResponse = await fetch(
						`/api/active-jobs?jobId=${$selectedJob.id}&gameStateId=${$currentGameState.id}`
					);
					if (updatedActiveJobResponse.ok) {
						const activeJobsList = await updatedActiveJobResponse.json();
						const updatedActiveJob = activeJobsList.find(
							(aj: any) => aj.id === currentActiveJob.id
						);

						if (updatedActiveJob) {
							// Update search results with the updated active job
							if ($searchResults) {
								const updatedResults = $searchResults.map((r) =>
									r.activeJob.id === updatedActiveJob.id ? { ...r, activeJob: updatedActiveJob } : r
								);
								jobSearchActions.setSearchResults($selectedEmployee, updatedResults);
							}

							// Use updated active job with computed duration
							setSelectedActiveJobData({
								activeJob: updatedActiveJob,
								employeeStartLocation: updatedActiveJob.employeeStartLocation,
								jobPickupAddress: null,
								jobDeliverAddress: null,
								activeRoute: routeData
							});
							isLoadingRoute = false;
							return;
						}
					}
				} catch (fetchError) {
					console.warn('Failed to fetch updated active job, using cached data:', fetchError);
				}

				// Fallback to original if update fetch fails
				setSelectedActiveJobData({
					activeJob: currentActiveJob,
					employeeStartLocation: currentActiveJob.employeeStartLocation,
					jobPickupAddress: null,
					jobDeliverAddress: null,
					activeRoute: routeData
				});
			}
			isLoadingRoute = false;
		} catch (error) {
			console.error('Error loading job details:', error);
			isLoadingRoute = false;
		}
	}

	function clearPreviousState() {
		setSelectedActiveJobData(null);
		jobPickupAddress = null;
		jobDeliverAddress = null;
		isAcceptingJob = false;
		isLoadingRoute = false;
	}

	async function handleAcceptJob() {
		if (!currentActiveJob || !$currentGameState || !$selectedEmployee) return;

		isAcceptingJob = true;

		try {
			const response = await fetch('/api/active-jobs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					activeJobId: currentActiveJob.id,
					gameStateId: $currentGameState.id,
					employeeId: $selectedEmployee
				})
			});

			if (response.ok) {
				const result = await response.json();
				addError('Job accepted successfully!', 'info');

				// Clear all search results for this employee (all other jobs)
				if ($selectedEmployee) {
					jobSearchActions.clearSearchResults($selectedEmployee);
				}

				// Clear the selected job and preview route BEFORE refreshing data
				clearSelectedJob();
				clearPreviousState();

				// Update the global store and set up completion timers
				if ($selectedEmployee && result.activeJob) {
					gameDataActions.setEmployeeActiveJob($selectedEmployee, result.activeJob);
				}

				// Refresh the full employee data to ensure everything is in sync
				try {
					await gameDataAPI.loadAllEmployeeData();
				} catch (error) {
					console.error('Error refreshing employee data:', error);
				}
			} else {
				const errorData = await response.json();
				addError(errorData.message || 'Failed to accept job', 'error');
			}
		} catch (error) {
			console.error('Error accepting job:', error);
			addError('Failed to accept job', 'error');
		} finally {
			isAcceptingJob = false;
		}
	}

	function handleCancel() {
		clearSelectedJob();
		clearPreviousState();
	}

	// Compute XP for the selected job
	$: jobXp =
		$config && $selectedJob && $currentGameState
			? computeJobXp($selectedJob, $config, $currentGameState)
			: 0;
</script>

{#if $selectedJob}
	<div class="card border border-base-300 bg-base-100 shadow-lg">
		<div class="card-body p-4">
			<!-- Header with tier badge and close button -->
			<div class="mb-3 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<span
						class="badge badge-lg font-bold text-white"
						style="background-color: {getTierColor($selectedJob.jobTier)}"
					>
						Tier {$selectedJob.jobTier}
					</span>
					<span class="text-lg font-semibold text-base-content">
						{getCategoryName($selectedJob.jobCategory)}
					</span>
				</div>
				<button
					class="btn btn-circle btn-ghost btn-sm"
					on:click={handleCancel}
					title="Close job details"
				>
					✕
				</button>
			</div>

			<!-- Job details grid -->
			<div class="mb-4 grid grid-cols-2 gap-4 text-sm">
				<div class="text-center">
					<div class="text-xs font-medium text-base-content/60">Reward</div>
					<div class="text-lg font-bold text-success">
						{$config && $currentGameState
							? formatCurrency(
									computeJobReward($selectedJob.totalDistanceKm, $config, $currentGameState)
								)
							: '...'}
					</div>
				</div>

				<div class="text-center">
					<div class="text-xs font-medium text-base-content/60">Distance</div>
					<div class="text-lg font-bold text-info">
						{formatDistance($selectedJob.totalDistanceKm)}
					</div>
				</div>

				<div class="text-center">
					<div class="text-xs font-medium text-base-content/60">Duration</div>
					{#if currentActiveJob?.durationSeconds !== undefined && currentActiveJob.durationSeconds !== null}
						<div class="font-mono text-lg font-bold text-warning">
							{formatDuration(currentActiveJob.durationSeconds)}
						</div>
					{:else}
						<div class="text-lg font-bold text-warning opacity-50">-</div>
					{/if}
				</div>

				<div class="text-center">
					<div class="text-xs font-medium text-base-content/60">XP</div>
					<div class="text-lg font-bold text-primary">
						{$config ? jobXp.toLocaleString() : '...'}
					</div>
				</div>
			</div>

			<!-- Employee Info -->
			{#if $selectedEmployee && selectedEmployeeData}
				<div class="mb-4">
					<label class="label">
						<span class="label-text font-medium">Employee</span>
					</label>
					<div class="text-sm font-semibold">{selectedEmployeeData.employee.name}</div>
				</div>
			{:else}
				<div class="alert alert-warning mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>No employee selected. Select an employee and search for jobs first.</span>
				</div>
			{/if}

			<!-- Route Info -->
			{#if isLoadingRoute}
				<div class="alert alert-warning mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<div>
						<div class="font-medium">Loading Route...</div>
						<div class="text-sm opacity-90">Fetching route data...</div>
					</div>
				</div>
			{:else if currentActiveJob && $selectedActiveJobData}
				<div class="alert alert-info mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<div>
						<div class="font-medium">Route Ready</div>
						<div class="text-sm opacity-90">
							{#if currentActiveJob.startTime}
								Job started: {new Date(currentActiveJob.startTime).toLocaleString()}
							{:else}
								Route computed and ready to accept
							{/if}
						</div>
					</div>
				</div>
			{:else if !currentActiveJob && $selectedEmployee}
				<div class="alert alert-warning mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>This job is not in the search results. Search for jobs first.</span>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost" on:click={handleCancel}> Cancel </button>

				{#if isLoadingRoute}
					<button class="btn btn-primary" disabled>
						<span class="loading loading-spinner loading-sm"></span>
						Loading Route...
					</button>
				{:else if currentActiveJob && $selectedActiveJobData && !currentActiveJob.startTime}
					<button class="btn btn-success" on:click={handleAcceptJob} disabled={isAcceptingJob}>
						{#if isAcceptingJob}
							<span class="loading loading-spinner loading-sm"></span>
							Accepting...
						{:else}
							Accept Job
						{/if}
					</button>
				{:else if currentActiveJob && currentActiveJob.startTime}
					<div class="badge badge-success">Job In Progress</div>
				{/if}
			</div>

			<!-- Additional info -->
			<div class="mt-3 text-xs text-base-content/70">
				Posted: {new Date($selectedJob.generatedTime).toLocaleDateString()}
			</div>
		</div>
	</div>
{/if}
