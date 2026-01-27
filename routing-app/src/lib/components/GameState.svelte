<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { computeEmployeeCosts } from '$lib/employeeUtils';
	import { formatMoney } from '$lib/formatting';
	import EmployeeCard from './EmployeeCard.svelte';
	import ErrorOverlay from './ErrorOverlay.svelte';
	import Cheats from './Cheats.svelte';
	import RouteMap from './RouteMap.svelte';
	import RouteMapMaplibre from './RouteMapMaplibre.svelte';
	import GlobalXpPanel from './GlobalXpPanel.svelte';
	import UpgradesPanel from './UpgradesPanel.svelte';
	import EmployeesPanel from './EmployeesPanel.svelte';
	import { activeMainTab, switchToTab } from '$lib/stores/activeTab';
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
	import { regionOverlayEnabled } from '$lib/stores/regionOverlay';
	import type { GameState, Employee } from '$lib/server/db/schema';
	import { config } from '$lib/stores/config';

	// Props for initial data - we'll move this to stores
	export let gameState: GameState;
	export let initialEmployees: Employee[] = [];
	export let cheatsEnabled: boolean = false;

	// Ensure employees are sorted by order field for stable display ordering
	$: sortedEmployeeData = [...$fullEmployeeData].sort(
		(a, b) => (a.employee.order ?? 0) - (b.employee.order ?? 0)
	);

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
			// Evict all routes for this employee (job completed)
			const { evictAllRoutes } = await import('$lib/stores/routeCache');
			try {
				await evictAllRoutes(employeeId);
			} catch (error) {
				console.error('Error evicting routes cache:', error);
			}

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
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="container mx-auto px-4 py-6">
			<!-- Cheats Component (only shows when cheats are enabled) -->
			<Cheats />

			<!-- Main Tab Navigation -->
			<div class="tabs-boxed tabs mb-4">
				<button
					class="tab"
					class:tab-active={$activeMainTab === 'map'}
					on:click={() => switchToTab('map')}
				>
					Map
				</button>
				<button
					class="tab"
					class:tab-active={$activeMainTab === 'map_maplibre'}
					on:click={() => switchToTab('map_maplibre')}
				>
					MapLibre
				</button>
				<button
					class="tab"
					class:tab-active={$activeMainTab === 'employees'}
					on:click={() => switchToTab('employees')}
				>
					Employees ({$employees.length})
				</button>
				<button
					class="tab"
					class:tab-active={$activeMainTab === 'levels'}
					on:click={() => switchToTab('levels')}
				>
					Levels
				</button>
				<button
					class="tab"
					class:tab-active={$activeMainTab === 'upgrades'}
					on:click={() => switchToTab('upgrades')}
				>
					Upgrades
				</button>
			</div>

			<!-- Tab Content -->
			<div class="min-h-[700px]">
				{#if $activeMainTab === 'map'}
					<div class="card h-[700px] bg-base-100 shadow-lg">
						<div class="card-body p-2">
							<div class="flex items-center justify-between px-4 py-2">
								<h3 class="card-title">Route Map</h3>
								<label class="label cursor-pointer gap-2">
									<span class="label-text text-sm">Regions</span>
									<input
										type="checkbox"
										class="toggle toggle-sm"
										bind:checked={$regionOverlayEnabled}
									/>
								</label>
							</div>
							<div class="flex-1">
								<RouteMap />
							</div>
						</div>
					</div>
				{:else if $activeMainTab === 'map_maplibre'}
					<div class="card h-[700px] bg-base-100 shadow-lg">
						<div class="card-body p-2">
							<div class="flex items-center justify-between px-4 py-2">
								<h3 class="card-title">Route Map (MapLibre)</h3>
							</div>
							<div class="flex-1">
								<RouteMapMaplibre />
							</div>
						</div>
					</div>
				{:else if $activeMainTab === 'employees'}
					<EmployeesPanel />
				{:else if $activeMainTab === 'levels'}
					<GlobalXpPanel />
				{:else if $activeMainTab === 'upgrades'}
					<UpgradesPanel />
				{/if}
			</div>
		</div>
	</div>

	<!-- Global Error Overlay -->
	<ErrorOverlay />
{/if}
