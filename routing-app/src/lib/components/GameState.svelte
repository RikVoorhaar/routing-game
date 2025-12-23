<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { computeEmployeeCosts } from '$lib/employeeUtils';
	import { formatMoney } from '$lib/formatting';
	import EmployeeCard from './EmployeeCard.svelte';
	import EmployeeDetails from './EmployeeDetails.svelte';
	import ErrorOverlay from './ErrorOverlay.svelte';
	import Cheats from './Cheats.svelte';
	import RouteMap from './RouteMap.svelte';
	import JobCard from './JobCard.svelte';
	import { faker } from '@faker-js/faker';
	import { addError } from '$lib/stores/errors';
	import {
		gameDataActions,
		gameDataAPI,
		currentGameState,
		employees,
		currentUser,
		activeJobsByEmployee,
		fullEmployeeData
	} from '$lib/stores/gameData';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import type { GameState, Employee } from '$lib/server/db/schema';
	import { config } from '$lib/stores/config';

	// Props for initial data - we'll move this to stores
	export let gameState: GameState;
	export let initialEmployees: Employee[] = [];
	export let cheatsEnabled: boolean = false;

	let showHireModal = false;
	let newEmployeeName = '';
	let isHiring = false;
	let hireError = '';

	let configLoaded = false;

	// Initialize stores with props data
	onMount(async () => {
		// Ensure config is loaded before proceeding
		try {
			await config.load();
			configLoaded = true;
		} catch (error) {
			console.error('Failed to load config:', error);
			addError('Failed to load game configuration', 'error');
			return; // Don't proceed if config fails to load
		}

		gameDataActions.init({
			gameState,
			employees: initialEmployees,
			cheatsEnabled,
			user: {
				id: 'current-user', // We'll need to get this from session
				cheatsEnabled
			}
		});

		// Load all employee and active job data once (this also processes any completed jobs)
		try {
			await gameDataAPI.loadAllEmployeeData();
		} catch (error) {
			console.error('Failed to load employee data:', error);
			addError('Failed to load employee data', 'error');
		}
	});

	onDestroy(() => {
		// Clean up any completion timers when component is destroyed
		// This is handled automatically by the store when cleared
	});

	// Reactive calculations using stores - only calculate when config is loaded
	let hiringCost = 0;
	$: {
		if ($config && configLoaded) {
			hiringCost = computeEmployeeCosts(
				$employees.length,
				$config.employees.hiring.baseCost,
				$config.employees.hiring.exponent,
				$config.employees.hiring.firstEmployeeFree
			);
		}
	}
	$: canAffordEmployee = $currentGameState ? $currentGameState.money >= hiringCost : false;

	function handleHireModalOpen() {
		showHireModal = true;
		newEmployeeName = generateRandomEmployeeName();
		hireError = '';
	}

	function handleHireModalClose() {
		showHireModal = false;
		newEmployeeName = '';
		hireError = '';
	}

	function generateRandomEmployeeName(): string {
		return faker.person.fullName();
	}

	async function handleHireEmployee() {
		isHiring = true;
		hireError = '';

		try {
			const response = await fetch('/api/employees', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameStateId: $currentGameState!.id,
					employeeName: newEmployeeName
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to hire employee');
			}

			const result = await response.json();

			// Update stores
			gameDataActions.addEmployee(result.employee);
			gameDataActions.updateMoney(result.newBalance);

			handleHireModalClose();
		} catch (error) {
			hireError = error instanceof Error ? error.message : 'Failed to hire employee';
			addError(`Failed to hire employee: ${hireError}`, 'error');
		} finally {
			isHiring = false;
		}
	}

	async function handleEmployeeRouteAssigned(
		event: CustomEvent<{ employeeId: string; routeId: string }>
	) {
		const { employeeId } = event.detail;

		try {
			// Refresh employee data only (active jobs are managed by timers)
			await gameDataAPI.refreshEmployee(employeeId);
		} catch (error) {
			console.error('Error refreshing employee data:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to refresh employee data';
			addError(`Failed to refresh employee: ${errorMessage}`, 'error');
		}
	}

	async function handleEmployeeRouteCompleted(
		event: CustomEvent<{ employeeId: string; reward: number; newBalance: number }>
	) {
		const { employeeId, newBalance } = event.detail;

		try {
			// Update game state money and refresh employee data
			gameDataActions.updateMoney(newBalance);

			// Clear the active job for this employee
			gameDataActions.clearEmployeeActiveJob(employeeId);

			// Refresh employee data from server
			await gameDataAPI.refreshEmployee(employeeId);

			console.log(`🎉 Route completed! Employee ${employeeId} earned ${event.detail.reward}`);
			addError(
				`🎉 Route completed! Earned ${formatMoney(event.detail.reward)}`,
				'info',
				true,
				3000
			);
		} catch (error) {
			console.error('Error refreshing data after route completion:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to refresh data after route completion';
			addError(`Failed to update after route completion: ${errorMessage}`, 'error');
		}
	}

	async function handleCheatMoneyUpdated(event: CustomEvent<{ newBalance: number }>) {
		// Update game state money from cheat
		gameState.money = event.detail.newBalance;
		gameState = { ...gameState }; // Trigger reactivity
	}

	// New employee system event handlers
	async function handlePurchaseLicense(
		event: CustomEvent<{ employeeId: string; licenseType: any }>
	) {
		// TODO: Implement license purchase logic
		console.log('Purchase license:', event.detail);
	}

	async function handlePurchaseVehicle(
		event: CustomEvent<{ employeeId: string; vehicleType: any }>
	) {
		// TODO: Implement vehicle purchase logic
		console.log('Purchase vehicle:', event.detail);
	}

	async function handlePurchaseUpgrade(event: CustomEvent<{ employeeId: string; category: any }>) {
		// TODO: Implement upgrade purchase logic
		console.log('Purchase upgrade:', event.detail);
	}
</script>

{#if !configLoaded || !$config}
	<!-- Loading State -->
	<div class="flex min-h-screen items-center justify-center bg-base-200">
		<div class="text-center">
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<p class="mt-4 text-lg">Loading game configuration...</p>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-base-200">
		<!-- Header -->
		<div class="navbar bg-base-100 shadow-lg">
			<div class="flex-1">
				<a href="/character-select" class="btn btn-ghost text-xl">
					← {$currentGameState?.name || 'Game'}
				</a>
			</div>
			<div class="flex-none">
				<div class="stats stats-horizontal shadow">
					<div class="stat">
						<div class="stat-title">Money</div>
						<div class="stat-value text-success">{formatMoney($currentGameState?.money || 0)}</div>
					</div>
					<div class="stat">
						<div class="stat-title">Route Level</div>
						<div class="stat-value text-info">{$currentGameState?.routeLevel || 0}</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="container mx-auto px-4 py-6">
			<!-- Cheats Component (only shows when cheats are enabled) -->
			<Cheats />

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<!-- Left Panel - Employee Details and List -->
				<div class="space-y-6 lg:col-span-1">
					<!-- Selected Job Card -->
					<JobCard />

					<!-- Employee Details -->
					<EmployeeDetails />

					<!-- Employees List -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<h2 class="text-xl font-bold">Employees ({$employees.length})</h2>
							<button
								class="btn btn-primary btn-sm"
								class:btn-disabled={!canAffordEmployee}
								on:click={handleHireModalOpen}
								disabled={!canAffordEmployee}
							>
								<svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 6v6m0 0v6m0-6h6m-6 0H6"
									/>
								</svg>
								Hire
								{#if hiringCost > 0}
									({formatMoney(hiringCost)})
								{:else}
									(Free!)
								{/if}
							</button>
						</div>

						{#if $employees.length === 0}
							<div class="card bg-base-100 shadow">
								<div class="card-body py-8 text-center">
									<div class="mb-3">
										<svg
											class="mx-auto h-16 w-16 text-base-content/30"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
											>
											</path>
										</svg>
									</div>
									<h3 class="mb-2 text-lg font-bold">No Employees Yet</h3>
									<p class="mb-4 text-base-content/70">
										Hire your first employee to start running routes!
									</p>
									<button class="btn btn-primary" on:click={handleHireModalOpen}>
										Hire Your First Employee (Free!)
									</button>
								</div>
							</div>
						{:else}
							<div class="max-h-80 space-y-2 overflow-y-auto pr-2">
								{#each $fullEmployeeData as fed (fed.employee.id)}
									{@const activeJob = fed.activeJob}
									{@const activeRoute = fed.activeRoute}
									<EmployeeCard
										employee={fed.employee}
										{activeJob}
										{activeRoute}
										gameStateId={$currentGameState?.id || ''}
									/>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Right Panel - Map -->
				<div class="lg:col-span-2">
					<div class="card h-[700px] bg-base-100 shadow-lg">
						<div class="card-body p-2">
							<h3 class="card-title px-4 py-2">Route Map</h3>
							<div class="flex-1">
								<RouteMap />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Hire Employee Modal -->
	{#if showHireModal}
		<div class="modal modal-open">
			<div class="modal-box">
				<h3 class="mb-4 text-lg font-bold">Hire New Employee</h3>

				<div class="mb-4">
					<div class="alert alert-info">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<div>
							<div class="font-bold">
								Cost: {formatMoney(hiringCost)}
							</div>
							<div class="text-sm">
								{#if hiringCost === 0}
									Your first employee is free!
								{:else}
									Current balance: {formatMoney($currentGameState?.money || 0)}
								{/if}
							</div>
						</div>
					</div>
				</div>

				{#if hireError}
					<div class="alert alert-error mb-4">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<span>{hireError}</span>
					</div>
				{/if}

				<div class="form-control mb-6">
					<div class="label">
						<span class="label-text">Employee Name</span>
					</div>
					<div class="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-3">
						<div class="flex items-center gap-2">
							<svg
								class="h-5 w-5 text-primary"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
								/>
							</svg>
							<span class="text-lg font-medium">{newEmployeeName}</span>
						</div>
						<p class="mt-1 text-xs text-base-content/70">Name automatically generated</p>
					</div>
				</div>

				<div class="modal-action">
					<button class="btn btn-ghost" on:click={handleHireModalClose} disabled={isHiring}>
						Cancel
					</button>
					<button
						class="btn btn-primary"
						on:click={handleHireEmployee}
						disabled={isHiring || !canAffordEmployee}
					>
						{#if isHiring}
							<span class="loading loading-spinner loading-xs"></span>
							Hiring...
						{:else}
							Hire Employee
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Global Error Overlay -->
	<ErrorOverlay />
{/if}
