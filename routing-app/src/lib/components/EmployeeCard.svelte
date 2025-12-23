<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onDestroy } from 'svelte';
	import { selectedEmployee, selectEmployee } from '$lib/stores/selectedEmployee';
	import type { Employee, ActiveJob, Address, UpgradeState } from '$lib/server/db/schema';
	import { addError } from '$lib/stores/errors';
	import { selectedRoute, clearSelection } from '$lib/stores/selectedRoute';
	import { formatMoney, formatAddress, formatTimeFromMs } from '$lib/formatting';

	export let employee: Employee;
	export let availableRoutes: any[] = [];
	export let activeJob: ActiveJob | null = null;
	export let activeRoute: any | null = null; // Add activeRoute prop
	export let gameStateId: string;

	const dispatch = createEventDispatcher<{
		assignRoute: { employeeId: string; routeId: string };
		assignJob: { employeeId: string; jobId: string };
		routeCompleted: { employeeId: string; reward: number; newBalance: number };
	}>();

	let isAssigning = false;
	let isCompletingRoute = false;
	let previouslyCompleted = false; // Track if we've already processed completion
	let lastCompletedJobId = ''; // Track which job was last completed
	let jobCompletionState: 'pending' | 'processing' | 'completed' | 'error' = 'pending';
	let completionTimeout: any = null;

	// Cleanup timeout on component destroy
	onDestroy(() => {
		if (completionTimeout) {
			clearTimeout(completionTimeout);
		}
	});

	// Check if the currently selected route belongs to this employee
	$: selectedRouteIsForThisEmployee =
		$selectedRoute && availableRoutes.some((route) => route.id === $selectedRoute);

	// Job progress calculation - explicitly track activeJob changes for reactivity
	let jobProgress: ReturnType<typeof calculateJobProgress> = null;
	
	$: {
		// Force reactivity by explicitly referencing activeJob and its properties
		// This ensures the component reacts when activeJob prop changes
		const activeJobId = activeJob?.id;
		const activeJobStartTime = activeJob?.startTime;
		
		jobProgress = activeJob ? calculateJobProgress(activeJob) : null;
	}

	// Handle job completion with debouncing and state machine
	$: {
		if (
			activeJob &&
			jobProgress?.isComplete &&
			jobCompletionState === 'pending' &&
			lastCompletedJobId !== activeJob.id
		) {
			// Set state to processing immediately to prevent multiple triggers
			jobCompletionState = 'processing';

			// Clear any existing timeout
			if (completionTimeout) {
				clearTimeout(completionTimeout);
			}

			// Debounce the completion call
			completionTimeout = setTimeout(() => {
				handleJobCompletion();
			}, 100); // 100ms debounce
		}
	}

	// Reset completion state when job changes or is cleared
	$: if (!activeJob) {
		jobCompletionState = 'pending';
		lastCompletedJobId = '';
		if (completionTimeout) {
			clearTimeout(completionTimeout);
			completionTimeout = null;
		}
	} else if (activeJob && lastCompletedJobId !== activeJob.id) {
		// New job started, reset completion state
		jobCompletionState = 'pending';
		if (completionTimeout) {
			clearTimeout(completionTimeout);
			completionTimeout = null;
		}
	}

	// Clear route selection when this employee's context changes
	$: {
		if (selectedRouteIsForThisEmployee) {
			// Clear selection if this employee goes on a job
			if (activeJob) {
				clearSelection();
			}
			// Clear selection if the selected route is no longer available for this employee
			else if (availableRoutes.length === 0) {
				clearSelection();
			}
		}
	}

	// Is this employee selected?
	$: isSelected = $selectedEmployee === employee.id;

	// Tailwind class string for the card
	$: cardClass = [
		'card bg-base-200 shadow cursor-pointer transition-all duration-150',
		'hover:shadow-lg hover:border-primary/60',
		isSelected ? 'border-2 border-primary ring-1 ring-primary/30' : 'border border-transparent',
		'w-full'
	].join(' ');

	function calculateJobProgress(activeJob: ActiveJob) {
		if (!activeJob.startTime) {
			return null;
		}

		const startTime = new Date(activeJob.startTime).getTime();
		const currentTime = Date.now();
		const totalDurationMs = activeJob.durationSeconds * 1000;
		const elapsed = currentTime - startTime;
		const progress = Math.min(100, (elapsed / totalDurationMs) * 100);
		const remainingTimeMs = Math.max(0, totalDurationMs - elapsed);
		const isComplete = progress >= 100;

		return {
			progress,
			remainingTimeMs,
			isComplete,
			currentPhase: 'on_job' as const // ActiveJob doesn't have currentPhase, default to 'on_job'
		};
	}

	async function handleAssignRoute() {
		if (!$selectedRoute || !selectedRouteIsForThisEmployee) return;

		isAssigning = true;

		try {
			const response = await fetch('/api/employees', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'assignRoute',
					employeeId: employee.id,
					gameStateId,
					routeId: $selectedRoute
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to assign route');
			}

			dispatch('assignRoute', { employeeId: employee.id, routeId: $selectedRoute });
			clearSelection(); // Clear selection after successful assignment
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to assign route';
			addError(`Route assignment failed: ${errorMessage}`, 'error');
		} finally {
			isAssigning = false;
		}
	}

	async function handleAssignJob(jobId: string) {
		isAssigning = true;

		try {
			const response = await fetch('/api/employees', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'assignJob',
					employeeId: employee.id,
					gameStateId,
					jobId: jobId
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to assign job');
			}

			dispatch('assignJob', { employeeId: employee.id, jobId: jobId });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to assign job';
			addError(`Job assignment failed: ${errorMessage}`, 'error');
		} finally {
			isAssigning = false;
		}
	}

	async function handleJobCompletion() {
		if (!activeJob || jobCompletionState !== 'processing') {
			console.log('Job completion skipped:', {
				hasActiveJob: !!activeJob,
				state: jobCompletionState
			});
			return;
		}

		// Additional safety check
		if (lastCompletedJobId === activeJob.id) {
			console.log('Job already completed:', activeJob.id);
			jobCompletionState = 'completed';
			return;
		}

		try {
			console.log('Starting job completion for:', activeJob.id);

			const response = await fetch('/api/employees', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'completeJob',
					employeeId: employee.id,
					gameStateId,
					activeJobId: activeJob.id
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to complete job');
			}

			const result = await response.json();
			console.log(
				`Job completed successfully! Earned ${result.reward}. New balance: ${result.newBalance}`
			);

			// Mark as completed and track the job ID
			jobCompletionState = 'completed';
			lastCompletedJobId = activeJob.id;

			// Dispatch event to refresh employee data
			dispatch('routeCompleted', {
				employeeId: employee.id,
				reward: result.reward,
				newBalance: result.newBalance
			});
		} catch (err) {
			console.error('Error completing job:', err);
			const errorMessage = err instanceof Error ? err.message : 'Failed to complete job';

			// Use error store instead of local error state
			addError(`Job completion failed: ${errorMessage}`, 'error');

			// Set error state but don't reset to pending - let user handle manually
			jobCompletionState = 'error';
		}
	}

	function handleClick() {
		if (isSelected) {
			// If already selected, unselect
			selectEmployee(null);
		} else {
			// Select this employee
			selectEmployee(employee.id);
		}
	}

	function getXPForNextLevel(level: number): number {
		return level * 100;
	}
</script>

<button
	type="button"
	class={cardClass}
	on:click={handleClick}
	on:keydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			handleClick();
		}
	}}
>
	<div class="card-body p-3">
		<!-- Employee Name -->
		<h3 class="card-title mb-2 text-base font-semibold">{employee.name}</h3>

		<!-- Current Job Progress -->
		{#if activeJob && jobProgress}
			<div class="mb-3">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-xs text-base-content/70">
						On Job
					</span>
					<span class="text-xs text-base-content/70">
						{Math.round(jobProgress.progress)}%
					</span>
				</div>

				<progress
					class="progress progress-primary h-2 w-full"
					value={jobProgress.progress}
					max="100"
				></progress>

				{#if !jobProgress.isComplete}
					<div class="mt-1 text-xs text-base-content/60">
						ETA: {formatTimeFromMs(jobProgress.remainingTimeMs)}
					</div>
				{:else}
					<div class="mt-1 text-xs font-medium text-success">✅ Completed!</div>
				{/if}
			</div>
		{:else}
			<div class="mb-3">
				<div class="text-xs italic text-base-content/60">Idle</div>
			</div>
		{/if}

		<!-- Driving Level -->
		<!-- TODO: Re-enable when Employee type is updated with new fields -->
		<!-- 
        <div class="space-y-1">
            <div class="flex justify-between items-center">
                <span class="text-xs font-medium text-base-content/80">🚗 Driving</span>
                <span class="text-xs">Level {employee.drivingLevel.level}</span>
            </div>
            <progress 
                class="progress progress-info w-full h-1.5" 
                value={employee.drivingLevel.xp} 
                max={getXPForNextLevel(employee.drivingLevel.level)}
            ></progress>
        </div>
        -->
	</div>
</button>
