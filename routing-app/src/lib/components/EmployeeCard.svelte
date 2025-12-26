<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onDestroy } from 'svelte';
	import { selectedEmployee, selectEmployee } from '$lib/stores/selectedEmployee';
	import type {
		Employee,
		ActiveJob,
		Address,
		UpgradeState,
		GameState
	} from '$lib/server/db/schema';
	import { addError } from '$lib/stores/errors';
	import { selectedRoute, clearSelection } from '$lib/stores/selectedRoute';
	import { formatMoney, formatAddress, formatTimeFromMs } from '$lib/formatting';
	import { currentGameState, gameDataActions, gameDataAPI } from '$lib/stores/gameData';
	import { getLevelFromXp, getXpForLevel, getXpToNextLevel } from '$lib/xp/xpUtils';
	import {
		getVehicleConfig,
		getNextVehicleLevel,
		isVehicleLevelUnlocked,
		getVehicleUpgradeCost
	} from '$lib/vehicles/vehicleUtils';

	export let employee: Employee;
	export let availableRoutes: any[] = [];
	export let activeJob: ActiveJob | null = null;
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
	let progressUpdateInterval: NodeJS.Timeout | null = null;
	let isPurchasingUpgrade = false;
	let hoveredUpgradeButton = false;

	// Cleanup timeout and interval on component destroy
	onDestroy(() => {
		if (completionTimeout) {
			clearTimeout(completionTimeout);
		}
		if (progressUpdateInterval) {
			clearInterval(progressUpdateInterval);
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

	// Set up interval to update progress every second when job is active
	$: if (activeJob && activeJob.startTime) {
		// Clear any existing interval
		if (progressUpdateInterval) {
			clearInterval(progressUpdateInterval);
		}
		progressUpdateInterval = setInterval(() => {
			// Recalculate progress using the current activeJob prop
			// This will update the ETA every second for smooth animation
			jobProgress = activeJob ? calculateJobProgress(activeJob) : null;
		}, 1000);
	} else {
		// Clear interval when job is not active
		if (progressUpdateInterval) {
			clearInterval(progressUpdateInterval);
			progressUpdateInterval = null;
		}
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
		'bg-base-300 shadow cursor-pointer transition-all duration-150',
		isSelected ? 'border-2 border-primary ring-1 ring-primary/30' : 'border border-base-content/30',
		'hover:shadow-lg hover:bg-base-200',
		isSelected ? '' : 'hover:border-primary/60',
		'w-full rounded-lg'
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

	async function handleVehicleUpgrade(e: MouseEvent) {
		e.stopPropagation(); // Prevent card click
		if (!nextVehicleLevel || !$currentGameState || isPurchasingUpgrade || !canAffordUpgrade) return;

		// Store the vehicle we're upgrading TO before the upgrade happens
		// (after upgrade, nextVehicle will point to the next level)
		const vehicleBeingUpgradedTo = nextVehicle;

		isPurchasingUpgrade = true;
		try {
			const response = await fetch('/api/employees/vehicle-upgrade', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					employeeId: employee.id,
					gameStateId: $currentGameState.id
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to purchase vehicle upgrade');
			}

			const result = await response.json();
			gameDataActions.setGameState(result.gameState);
			await gameDataAPI.loadAllEmployeeData();

			addError(`Vehicle upgraded to ${vehicleBeingUpgradedTo?.name || 'next level'}!`, 'info');
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : 'Failed to purchase vehicle upgrade';
			addError(errorMessage, 'error');
		} finally {
			isPurchasingUpgrade = false;
		}
	}

	// Calculate employee level from XP
	$: employeeLevel = typeof employee?.xp === 'number' ? getLevelFromXp(employee.xp) : 0;
	$: xpForCurrentLevel = employeeLevel >= 0 ? getXpForLevel(employeeLevel) : 0;
	$: xpForNextLevel =
		employeeLevel >= 0 && employeeLevel < 120 ? getXpForLevel(employeeLevel + 1) : 0;
	$: xpProgress =
		typeof employee?.xp === 'number' ? Math.max(0, employee.xp - xpForCurrentLevel) : 0;
	$: xpNeeded = xpForNextLevel > xpForCurrentLevel ? xpForNextLevel - xpForCurrentLevel : 1;
	$: xpProgressPercent = xpNeeded > 0 ? (xpProgress / xpNeeded) * 100 : 0;

	// Get current vehicle config
	$: currentVehicle =
		typeof employee?.vehicleLevel === 'number' ? getVehicleConfig(employee.vehicleLevel) : null;
	$: vehicleCapacity = currentVehicle?.capacity ?? 0;
	$: vehicleSpeed = currentVehicle?.roadSpeed ?? 0;
	$: vehicleTier = currentVehicle?.tier ?? 0;
	$: vehicleName = currentVehicle?.name ?? 'Unknown';

	// Check upgrade availability (only when gameState is available)
	$: gameState = $currentGameState;
	$: nextVehicleLevel = gameState
		? getNextVehicleLevel(employee.vehicleLevel ?? 0, gameState)
		: null;
	$: upgradeCost =
		nextVehicleLevel !== null && nextVehicleLevel !== undefined
			? getVehicleUpgradeCost(nextVehicleLevel)
			: null;
	$: canAffordUpgrade =
		gameState && upgradeCost !== null && typeof gameState.money === 'number'
			? gameState.money >= upgradeCost
			: false;
	$: isUpgradeUnlocked =
		gameState && nextVehicleLevel !== null && nextVehicleLevel !== undefined
			? isVehicleLevelUnlocked(nextVehicleLevel, gameState)
			: false;
	$: upgradeButtonState =
		nextVehicleLevel === null || nextVehicleLevel === undefined
			? 'max'
			: !isUpgradeUnlocked
				? 'locked'
				: !canAffordUpgrade
					? 'too_expensive'
					: 'available';

	// Get next vehicle stats for hover preview
	$: nextVehicle =
		nextVehicleLevel !== null && nextVehicleLevel !== undefined
			? getVehicleConfig(nextVehicleLevel)
			: null;
</script>

<div
	class={cardClass}
	class:h-24={true}
	on:click={handleClick}
	on:keydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			handleClick();
		}
	}}
	role="button"
	tabindex="0"
>
	<div class="grid h-full grid-cols-2 gap-3 p-3">
		<!-- Left Column: Name, Progress Bar, ETA -->
		<div class="flex min-w-0 flex-col">
			<h3 class="mb-1 truncate text-left text-sm font-semibold">{employee.name}</h3>
			<div class="mb-1">
				<progress
					class="progress progress-primary h-2 w-full"
					class:opacity-50={!activeJob || !jobProgress}
					value={activeJob && jobProgress ? jobProgress.progress : 0}
					max="100"
				></progress>
			</div>
			<div class="text-left text-xs text-base-content/60">
				{#if activeJob && jobProgress && !jobProgress.isComplete}
					ETA: {formatTimeFromMs(jobProgress.remainingTimeMs)}
				{:else}
					Idle
				{/if}
			</div>
		</div>

		<!-- Right Column: Level, Stats, Vehicle Name, Upgrade Button -->
		<div class="flex min-w-0 flex-col items-end justify-between gap-2">
			<!-- Level and XP Progress -->
			<div class="flex items-center gap-1">
				<div class="text-xs text-base-content/70">Lv {employeeLevel}</div>
				<div class="flex items-center gap-1">
					<progress class="progress progress-info h-2 w-16" value={xpProgress} max={xpNeeded}
					></progress>
					<span class="whitespace-nowrap text-xs text-base-content/60">
						{Math.floor(xpProgress)}/{xpNeeded}
					</span>
				</div>
			</div>

			<!-- Stats (or preview stats on hover) -->
			<div
				class="flex items-center gap-2 text-xs {hoveredUpgradeButton && nextVehicle
					? 'text-success'
					: 'text-base-content/70'}"
			>
				{#if hoveredUpgradeButton && nextVehicle}
					<span>C: {nextVehicle.capacity}kg</span>
					<span
						>t: {nextVehicle.tier === 1
							? 'I'
							: nextVehicle.tier === 2
								? 'II'
								: nextVehicle.tier === 3
									? 'III'
									: nextVehicle.tier === 4
										? 'IV'
										: nextVehicle.tier === 5
											? 'V'
											: nextVehicle.tier}</span
					>
					<span>s: {nextVehicle.roadSpeed}km/h</span>
				{:else}
					<span>C: {vehicleCapacity}kg</span>
					<span
						>t: {vehicleTier === 1
							? 'I'
							: vehicleTier === 2
								? 'II'
								: vehicleTier === 3
									? 'III'
									: vehicleTier === 4
										? 'IV'
										: vehicleTier === 5
											? 'V'
											: vehicleTier}</span
					>
					<span>s: {vehicleSpeed}km/h</span>
				{/if}
			</div>

			<!-- Vehicle Name and Upgrade Button -->
			<div class="flex items-center gap-2">
				<span class="text-xs text-base-content/70">{vehicleName}</span>
				{#if upgradeButtonState === 'max'}
					<button
						class="btn btn-xs cursor-not-allowed border border-base-content/20 bg-base-300 font-light !text-red-200"
						disabled
						on:click|stopPropagation
					>
						Max
					</button>
				{:else if upgradeButtonState === 'locked'}
					<button
						class="btn btn-xs cursor-not-allowed border border-base-content/20 bg-base-300 font-light !text-red-200"
						disabled
						on:click|stopPropagation
					>
						Upgrade locked
					</button>
				{:else if upgradeButtonState === 'too_expensive'}
					<button
						class="btn btn-xs cursor-not-allowed border border-base-content/20 bg-base-300 font-light !text-red-200"
						disabled={true}
						on:click|stopPropagation
					>
						Upgrade {formatMoney(upgradeCost ?? 0)}
					</button>
				{:else if upgradeButtonState === 'available'}
					<button
						class="btn btn-success btn-xs"
						disabled={isPurchasingUpgrade}
						on:click|stopPropagation={handleVehicleUpgrade}
						on:mouseenter={() => (hoveredUpgradeButton = true)}
						on:mouseleave={() => (hoveredUpgradeButton = false)}
					>
						{#if isPurchasingUpgrade}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							Upgrade {formatMoney(upgradeCost ?? 0)}
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
