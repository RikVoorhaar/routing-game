<script lang="ts">
	import { selectedJob, clearSelectedJob } from '$lib/stores/selectedJob';
	import {
		selectedActiveJob,
		selectActiveJob,
		clearSelectedActiveJob,
		cachedActiveJobs,
		cacheActiveJobsForJob
	} from '$lib/stores/activeJobs';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { employees, currentGameState, gameDataAPI } from '$lib/stores/gameData';
	import { getCategoryName, getTierColor } from '$lib/jobCategories';
	import { formatCurrency, formatDistance, formatTime } from '$lib/formatting';
	import { employeeCanPerformJob, sortEmployeesByDistanceFromJob } from '$lib/jobAssignment';
	import { addError } from '$lib/stores/errors';
	import type { Employee } from '$lib/employeeUtils';
	import type { ActiveJob } from '$lib/stores/activeJobs';
	import type { Job } from '$lib/types';

	let selectedEmployeeId: string | null = null;
	let isLoadingActiveJobs = false;
	let isCreatingActiveJob = false;
	let isAcceptingJob = false;
	let eligibleEmployees: Employee[] = [];
	let activeJobsForJob: Array<{ activeJob: ActiveJob; employee: Employee }> = [];
	let computedActiveJob: {
		activeJob: ActiveJob;
		totalTravelTime: number;
		computedPayout: number;
		isExisting: boolean;
	} | null = null;

	// Track the previous job to detect changes
	let previousJobId: number | null = null;

	// Reactive statements
	$: if ($selectedJob && $employees.length > 0) {
		// Clear previous state when job changes
		if (previousJobId !== $selectedJob.id) {
			clearPreviousState();
			previousJobId = $selectedJob.id;
		}
		updateEligibleEmployees();
		loadActiveJobsForJob();
	}

	function clearPreviousState() {
		computedActiveJob = null;
		clearSelectedActiveJob();
		selectedEmployeeId = null;
		isCreatingActiveJob = false;
		isAcceptingJob = false;
	}

	$: if ($selectedEmployee && eligibleEmployees.length > 0) {
		// Set default selected employee if it's eligible
		const isEligible = eligibleEmployees.some((emp) => emp.id === $selectedEmployee);
		selectedEmployeeId = isEligible ? $selectedEmployee : eligibleEmployees[0]?.id || null;
	}

	function updateEligibleEmployees() {
		if (!$selectedJob) {
			eligibleEmployees = [];
			return;
		}

		try {
			// Filter employees that can perform this job
			const capable = $employees.filter((emp) => {
				try {
					return employeeCanPerformJob(emp, $selectedJob);
				} catch (error) {
					console.error('Error checking if employee can perform job:', error);
					return false;
				}
			});

			// Sort by distance from job location
			eligibleEmployees = sortEmployeesByDistanceFromJob(capable, $selectedJob);

			// Set default selected employee
			if (eligibleEmployees.length > 0) {
				const defaultEmployee =
					eligibleEmployees.find((emp) => emp.id === $selectedEmployee) || eligibleEmployees[0];
				selectedEmployeeId = defaultEmployee.id;
			}
		} catch (error) {
			console.error('Error updating eligible employees:', error);
			eligibleEmployees = [];
		}
	}

	async function loadActiveJobsForJob() {
		if (!$selectedJob || !$currentGameState) return;

		isLoadingActiveJobs = true;
		try {
			const response = await fetch(
				`/api/active-jobs?jobId=${$selectedJob.id}&gameStateId=${$currentGameState.id}`
			);
			if (response.ok) {
				activeJobsForJob = await response.json();
				// Defensive check in case selectedJob becomes null during async operation
				if ($selectedJob && Array.isArray(activeJobsForJob)) {
					cacheActiveJobsForJob(
						$selectedJob.id,
						activeJobsForJob.map((item) => item?.activeJob).filter(Boolean)
					);
				}
			} else {
				addError('Failed to load active jobs', 'error');
			}
		} catch (error) {
			console.error('Error loading active jobs:', error);
			addError('Failed to load active jobs', 'error');
		} finally {
			isLoadingActiveJobs = false;
		}
	}

	async function handleEmployeeSelection() {
		if (!selectedEmployeeId || !$selectedJob || !$currentGameState) return;

		isCreatingActiveJob = true;
		computedActiveJob = null;

		try {
			const response = await fetch('/api/active-jobs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					employeeId: selectedEmployeeId,
					jobId: $selectedJob.id,
					gameStateId: $currentGameState.id
				})
			});

			if (response.ok) {
				computedActiveJob = await response.json();
				if (computedActiveJob) {
					selectActiveJob(computedActiveJob.activeJob);
				}
			} else {
				const errorData = await response.json();
				addError(errorData.message || 'Failed to compute job route', 'error');
			}
		} catch (error) {
			console.error('Error creating active job:', error);
			addError('Failed to compute job route', 'error');
		} finally {
			isCreatingActiveJob = false;
		}
	}

	async function handleAcceptJob() {
		if (!$selectedActiveJob || !$currentGameState) return;

		isAcceptingJob = true;

		try {
			const response = await fetch('/api/active-jobs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					activeJobId: $selectedActiveJob.id,
					gameStateId: $currentGameState.id
				})
			});

			if (response.ok) {
				addError('Job accepted successfully!', 'info');

				// Refresh the employee data to show the new active job
				if ($selectedActiveJob.employeeId) {
					try {
						await gameDataAPI.refreshEmployee($selectedActiveJob.employeeId);
					} catch (error) {
						console.error('Error refreshing employee data:', error);
						// Don't fail the whole operation if employee refresh fails
					}
				}

				clearSelectedJob();
				clearSelectedActiveJob();
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
		clearSelectedActiveJob();
		computedActiveJob = null;
		selectedEmployeeId = null;
	}
</script>

{#if $selectedJob}
	<div class="card bg-base-100 border-base-300 border shadow-lg">
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
					<span class="text-base-content text-lg font-semibold">
						{getCategoryName($selectedJob.jobCategory)}
					</span>
				</div>
				<button
					class="btn btn-sm btn-ghost btn-circle"
					on:click={handleCancel}
					title="Close job details"
				>
					✕
				</button>
			</div>

			<!-- Job details grid -->
			<div class="mb-4 grid grid-cols-2 gap-4 text-sm">
				<div class="text-center">
					<div class="text-base-content/60 text-xs font-medium">Reward</div>
					<div class="text-success text-lg font-bold">
						{formatCurrency($selectedJob.approximateValue)}
					</div>
				</div>

				<div class="text-center">
					<div class="text-base-content/60 text-xs font-medium">Distance</div>
					<div class="text-info text-lg font-bold">
						{formatDistance($selectedJob.totalDistanceKm)}
					</div>
				</div>

				<div class="text-center">
					<div class="text-base-content/60 text-xs font-medium">Duration</div>
					<div class="text-warning text-lg font-bold">
						{formatTime($selectedJob.totalTimeSeconds)}
					</div>
				</div>

				<div class="text-center">
					<div class="text-base-content/60 text-xs font-medium">Job ID</div>
					<div class="text-base-content text-base font-bold">
						#{$selectedJob.id}
					</div>
				</div>
			</div>

			<!-- Employee Selection -->
			{#if eligibleEmployees.length > 0}
				<div class="mb-4">
					<label class="label">
						<span class="label-text font-medium">Select Employee</span>
						{#if isLoadingActiveJobs}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
					</label>
					<select
						class="select select-bordered w-full"
						bind:value={selectedEmployeeId}
						on:change={handleEmployeeSelection}
						disabled={isCreatingActiveJob}
					>
						{#each eligibleEmployees as employee}
							<option value={employee.id}>
								{employee.name}
								{#if employee.id === $selectedEmployee}(Current){/if}
							</option>
						{/each}
					</select>
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
					<span>No employees can perform this job. Check license and vehicle requirements.</span>
				</div>
			{/if}

			<!-- Computed Route Info -->
			{#if computedActiveJob && !computedActiveJob.isExisting}
				<div class="alert alert-info mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<div>
						<div class="font-medium">Route Computed</div>
						<div class="text-sm opacity-90">
							Travel Time: {formatTime(computedActiveJob.totalTravelTime)}<br />
							Payout: {formatCurrency(computedActiveJob.computedPayout)}
						</div>
					</div>
				</div>
			{:else if computedActiveJob && computedActiveJob.isExisting}
				<div class="alert alert-warning mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>This job assignment already exists and is ready to accept.</span>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost" on:click={handleCancel}> Cancel </button>

				{#if selectedEmployeeId && !computedActiveJob}
					<button
						class="btn btn-primary"
						on:click={handleEmployeeSelection}
						disabled={isCreatingActiveJob}
					>
						{#if isCreatingActiveJob}
							<span class="loading loading-spinner loading-sm"></span>
							Computing Route...
						{:else}
							Compute Route
						{/if}
					</button>
				{:else if computedActiveJob && $selectedActiveJob}
					<button class="btn btn-success" on:click={handleAcceptJob} disabled={isAcceptingJob}>
						{#if isAcceptingJob}
							<span class="loading loading-spinner loading-sm"></span>
							Accepting...
						{:else}
							Accept Job
						{/if}
					</button>
				{/if}
			</div>

			<!-- Additional info -->
			<div class="text-base-content/70 mt-3 text-xs">
				Posted: {new Date($selectedJob.timeGenerated).toLocaleDateString()}

				{#if activeJobsForJob.length > 0}
					<br />
					<span class="badge badge-sm badge-outline">
						{activeJobsForJob.length} active assignment{activeJobsForJob.length === 1 ? '' : 's'}
					</span>
				{/if}
			</div>
		</div>
	</div>
{/if}
