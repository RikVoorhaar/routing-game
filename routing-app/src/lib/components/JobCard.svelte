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
	import { employeeCanPerformJob, sortEmployeesByDistanceFromJob } from '$lib/jobs/jobAssignment';
	import { addError } from '$lib/stores/errors';
	import type { Employee, Job } from '$lib/server/db/schema';
	import { writable, derived } from 'svelte/store';
	import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
	import { config } from '$lib/stores/config';

	let selectedEmployeeId: string | null = null;
	let isLoadingActiveJobs = false;
	let isCreatingActiveJob = false;
	let isAcceptingJob = false;
	let eligibleEmployees: Employee[] = [];

	// Store for active jobs associated with the current job, keyed by employee ID
	const activeJobsByEmployee = writable<
		Record<
			string,
			{
				activeJob: any;
				activeRoute?: any;
				employeeStartLocation?: any;
				jobPickupAddress?: any;
				jobDeliverAddress?: any;
			}
		>
	>({});

	// Reactive store for the selected employee ID
	const selectedEmployeeIdStore = writable<string | null>(null);

	// Derived store for the currently selected employee's active job data
	const selectedEmployeeActiveJobData = derived(
		[activeJobsByEmployee, selectedEmployeeIdStore],
		([$activeJobsByEmployee, $selectedEmployeeId]) => {
			if (!$selectedEmployeeId) return null;
			return $activeJobsByEmployee[$selectedEmployeeId] || null;
		}
	);

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

	// Update eligible employees when fullEmployeeData changes (employees get/complete jobs)
	$: if ($selectedJob && $fullEmployeeData.length > 0) {
		updateEligibleEmployees();
	}

	function clearPreviousState() {
		activeJobsByEmployee.set({});
		setSelectedActiveJobData(null);
		selectedEmployeeId = null;
		selectedEmployeeIdStore.set(null);
		isCreatingActiveJob = false;
		isAcceptingJob = false;
	}

	// Handle initial employee selection when job changes or when selection becomes invalid
	// This only sets a default if the current selection is invalid - it won't override manual selection
	$: if ($selectedJob && eligibleEmployees.length > 0) {
		// Only update if current selection is invalid (not in eligible list)
		const currentIsValid =
			selectedEmployeeId && eligibleEmployees.some((emp) => emp.id === selectedEmployeeId);

		if (!currentIsValid) {
			// Current selection is invalid, pick a new one
			// Prefer the globally selected employee if they're eligible, otherwise use first available
			const preferredEmployee = $selectedEmployee
				? eligibleEmployees.find((emp) => emp.id === $selectedEmployee)
				: null;
			const newSelectedEmployeeId = preferredEmployee?.id || eligibleEmployees[0]?.id || null;

			if (newSelectedEmployeeId) {
				selectedEmployeeId = newSelectedEmployeeId;
				selectedEmployeeIdStore.set(selectedEmployeeId);
				// Note: Don't call handleEmployeeSelection() here to avoid conflicts with manual selection
				// It will be called by onEmployeeChange() or the updateEligibleEmployees() function
			}
		}
	}

	// Update the global selected active job data when the local selection changes
	$: if ($selectedEmployeeActiveJobData) {
		const data = $selectedEmployeeActiveJobData;
		if (
			data.activeJob &&
			data.employeeStartLocation &&
			data.jobPickupAddress &&
			data.jobDeliverAddress &&
			data.activeRoute
		) {
			setSelectedActiveJobData({
				activeJob: data.activeJob,
				employeeStartLocation: data.employeeStartLocation,
				jobPickupAddress: data.jobPickupAddress,
				jobDeliverAddress: data.jobDeliverAddress,
				activeRoute: data.activeRoute
			});
		}
	} else {
		setSelectedActiveJobData(null);
	}

	function updateEligibleEmployees() {
		if (!$selectedJob) {
			eligibleEmployees = [];
			return;
		}

		try {
			// Get a map of employee IDs to their full data (including active jobs)
			const employeeDataMap = new Map($fullEmployeeData.map((fed) => [fed.employee.id, fed]));

			// Filter employees that can perform this job AND are available (no active job)
			const capable = $employees.filter((emp) => {
				try {
					// Check if employee can perform the job
					if (!employeeCanPerformJob(emp, $selectedJob)) {
						return false;
					}

					// Check if employee is available (no active job or active job hasn't started)
					const employeeData = employeeDataMap.get(emp.id);
					if (employeeData?.activeJob?.startTime) {
						// Employee has an active job that has been started - not available
						return false;
					}

					return true;
				} catch (error) {
					console.error('Error checking if employee can perform job:', error);
					return false;
				}
			});

			// Sort by distance from job location
			eligibleEmployees = sortEmployeesByDistanceFromJob(capable, $selectedJob);

			// Set default selected employee only if current selection is invalid
			if (eligibleEmployees.length > 0) {
				// Check if currently selected employee is still eligible
				const currentEmployeeStillEligible =
					selectedEmployeeId && eligibleEmployees.some((emp) => emp.id === selectedEmployeeId);

				if (!currentEmployeeStillEligible) {
					// Current selection is no longer valid, pick a new one
					const defaultEmployee =
						eligibleEmployees.find((emp) => emp.id === $selectedEmployee) || eligibleEmployees[0];
					const newSelectedEmployeeId = defaultEmployee.id;

					selectedEmployeeId = newSelectedEmployeeId;
					selectedEmployeeIdStore.set(selectedEmployeeId);

					// Automatically compute route for the new employee
					if (selectedEmployeeId) {
						handleEmployeeSelection();
					}
				}
			} else {
				// No eligible employees, clear selection
				selectedEmployeeId = null;
				selectedEmployeeIdStore.set(null);
			}
		} catch (error) {
			console.error('Error updating eligible employees:', error);
			eligibleEmployees = [];
		}
	}

	async function loadActiveJobsForJob() {
		if (!$selectedJob || !$currentGameState) return;

		// Store the job ID locally to avoid race conditions when $selectedJob becomes null
		const jobId = $selectedJob.id;
		const gameStateId = $currentGameState.id;

		isLoadingActiveJobs = true;
		try {
			const response = await fetch(`/api/active-jobs?jobId=${jobId}&gameStateId=${gameStateId}`);
			if (response.ok) {
				const allActiveJobs = await response.json();

				// Double-check that $selectedJob is still set before processing results
				// This prevents errors if the job was cleared while the fetch was in progress
				if (!$selectedJob || $selectedJob.id !== jobId) {
					return;
				}

				// Group active jobs by employee ID for this job
				const jobActiveJobs: Record<
					string,
					{
						activeJob: any;
						activeRoute?: any;
						employeeStartLocation?: any;
						jobPickupAddress?: any;
						jobDeliverAddress?: any;
					}
				> = {};

				for (const activeJob of allActiveJobs) {
					if (activeJob.jobId === jobId) {
						jobActiveJobs[activeJob.employeeId] = { activeJob };
					}
				}

				activeJobsByEmployee.set(jobActiveJobs);
			} else {
				// Only show error if the job is still selected (avoid showing error after clearing)
				if ($selectedJob && $selectedJob.id === jobId) {
					addError('Failed to load active jobs', 'error');
				}
			}
		} catch (error) {
			console.error('Error loading active jobs:', error);
			// Only show error if the job is still selected (avoid showing error after clearing)
			if ($selectedJob && $selectedJob.id === jobId) {
				addError('Failed to load active jobs', 'error');
			}
		} finally {
			isLoadingActiveJobs = false;
		}
	}

	async function handleEmployeeSelection() {
		if (!selectedEmployeeId || !$selectedJob || !$currentGameState) return;

		// Check if we already have this employee's active job data
		const currentData = $activeJobsByEmployee;
		if (currentData[selectedEmployeeId] && currentData[selectedEmployeeId].activeRoute) {
			// We already have complete data for this employee
			return;
		}

		isCreatingActiveJob = true;

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
				const result = await response.json();

				// Update our cache with the new active job data
				if (selectedEmployeeId) {
					activeJobsByEmployee.update((cache) => ({
						...cache,
						[selectedEmployeeId!]: {
							activeJob: result.activeJob,
							activeRoute: result.activeRoute,
							employeeStartLocation: result.employeeStartLocation,
							jobPickupAddress: result.jobPickupAddress,
							jobDeliverAddress: result.jobDeliverAddress
						}
					}));
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
		if (!$selectedActiveJobData || !$currentGameState || !selectedEmployeeId) return;

		isAcceptingJob = true;

		try {
			const response = await fetch('/api/active-jobs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					activeJobId: $selectedActiveJobData.activeJob.id,
					gameStateId: $currentGameState.id,
					employeeId: selectedEmployeeId
				})
			});

			if (response.ok) {
				const result = await response.json();
				addError('Job accepted successfully!', 'info');

				// Update the active job in our local cache to reflect it's been started
				if (selectedEmployeeId) {
					activeJobsByEmployee.update((cache) => ({
						...cache,
						[selectedEmployeeId!]: {
							...cache[selectedEmployeeId!],
							activeJob: result.activeJob
						}
					}));
				}

				// Update the global store and set up completion timers
				if (selectedEmployeeId && result.activeJob) {
					gameDataActions.setEmployeeActiveJob(selectedEmployeeId, result.activeJob);
				}

				// Refresh the full employee data to ensure everything is in sync
				try {
					await gameDataAPI.loadAllEmployeeData();
				} catch (error) {
					console.error('Error refreshing employee data:', error);
				}

				clearSelectedJob();
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
		activeJobsByEmployee.set({});
		selectedEmployeeId = null;
		selectedEmployeeIdStore.set(null);
	}

	// Handle employee selection change
	function onEmployeeChange() {
		selectedEmployeeIdStore.set(selectedEmployeeId);
		// Automatically compute route when user changes employee selection
		if (selectedEmployeeId) {
			handleEmployeeSelection();
		}
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
					{#if $selectedEmployeeActiveJobData?.activeJob?.durationSeconds !== undefined && $selectedEmployeeActiveJobData.activeJob.durationSeconds !== null}
						<div class="font-mono text-lg font-bold text-warning">
							{formatDuration($selectedEmployeeActiveJobData.activeJob.durationSeconds)}
						</div>
					{:else}
						<div class="text-lg font-bold text-warning opacity-50">Computing...</div>
					{/if}
				</div>

				<div class="text-center">
					<div class="text-xs font-medium text-base-content/60">XP</div>
					<div class="text-lg font-bold text-primary">
						{$config ? jobXp.toLocaleString() : '...'}
					</div>
				</div>
			</div>

			<!-- Employee Selection -->
			{#if eligibleEmployees.length > 0}
				<div class="mb-4">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="label">
						<span class="label-text font-medium">Select Employee</span>
						{#if isLoadingActiveJobs}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
					</label>
					<select
						class="select select-bordered w-full"
						bind:value={selectedEmployeeId}
						on:change={onEmployeeChange}
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
			{#if isCreatingActiveJob}
				<div class="alert alert-warning mb-4">
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
							clip-rule="evenodd"
						/>
					</svg>
					<div>
						<div class="font-medium">Computing Route...</div>
						<div class="text-sm opacity-90">Calculating optimal route for selected employee</div>
					</div>
				</div>
			{:else if $selectedEmployeeActiveJobData}
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
							{#if $selectedEmployeeActiveJobData.activeJob.startTime}
								Job started: {new Date(
									$selectedEmployeeActiveJobData.activeJob.startTime
								).toLocaleString()}
							{:else}
								Route computed and ready to accept
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex justify-end gap-2">
				<button class="btn btn-ghost" on:click={handleCancel}> Cancel </button>

				{#if isCreatingActiveJob}
					<button class="btn btn-primary" disabled>
						<span class="loading loading-spinner loading-sm"></span>
						Computing Route...
					</button>
				{:else if $selectedEmployeeActiveJobData && $selectedActiveJobData && !$selectedActiveJobData.activeJob.startTime}
					<button class="btn btn-success" on:click={handleAcceptJob} disabled={isAcceptingJob}>
						{#if isAcceptingJob}
							<span class="loading loading-spinner loading-sm"></span>
							Accepting...
						{:else}
							Accept Job
						{/if}
					</button>
				{:else if $selectedEmployeeActiveJobData && $selectedActiveJobData && $selectedActiveJobData.activeJob.startTime}
					<div class="badge badge-success">Job In Progress</div>
				{/if}
			</div>

			<!-- Additional info -->
			<div class="mt-3 text-xs text-base-content/70">
				Posted: {new Date($selectedJob.generatedTime).toLocaleDateString()}

				{#if Object.keys($activeJobsByEmployee).length > 0}
					<br />
					<span class="badge badge-outline badge-sm">
						{Object.keys($activeJobsByEmployee).length} active assignment{Object.keys(
							$activeJobsByEmployee
						).length === 1
							? ''
							: 's'}
					</span>
				{/if}
			</div>
		</div>
	</div>
{/if}
