<script lang="ts">
	import { computeEmployeeCosts } from '$lib/employeeUtils';
	import { formatMoney } from '$lib/formatting';
	import EmployeeCard from './EmployeeCard.svelte';
	import { faker } from '@faker-js/faker';
	import { addError } from '$lib/stores/errors';
	import {
		gameDataActions,
		gameDataAPI,
		currentGameState,
		employees,
		fullEmployeeData
	} from '$lib/stores/gameData';
	import { config } from '$lib/stores/config';

	// Ensure employees are sorted by order field for stable display ordering
	$: sortedEmployeeData = [...$fullEmployeeData].sort(
		(a, b) => (a.employee.order ?? 0) - (b.employee.order ?? 0)
	);

	let isHiring = false;

	// Reactive calculations using stores
	let hiringCost = 0;
	$: {
		if ($config) {
			hiringCost = computeEmployeeCosts(
				$employees.length,
				$config.employees.hiring.baseCost,
				$config.employees.hiring.exponent,
				$config.employees.hiring.firstEmployeeFree
			);
		}
	}
	$: canAffordEmployee = $currentGameState ? $currentGameState.money >= hiringCost : false;

	async function handleHireEmployee() {
		if (!$currentGameState) return;

		isHiring = true;

		try {
			const newEmployeeName = faker.person.fullName();

			const response = await fetch('/api/employees', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameStateId: $currentGameState.id,
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

			addError(`Hired ${newEmployeeName}!`, 'info', true, 3000);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to hire employee';
			addError(`Failed to hire employee: ${errorMessage}`, 'error');
		} finally {
			isHiring = false;
		}
	}
</script>

<div class="card bg-base-100 shadow-lg">
	<div class="card-body">
		<!-- Header with hire button -->
		<div class="mb-4 flex items-center justify-between">
			<h2 class="card-title text-2xl">Employees ({$employees.length})</h2>
			<button
				class="btn btn-primary"
				class:btn-disabled={!canAffordEmployee || isHiring}
				on:click={handleHireEmployee}
				disabled={!canAffordEmployee || isHiring}
			>
				{#if isHiring}
					<span class="loading loading-spinner loading-sm"></span>
					Hiring...
				{:else}
					<svg class="mr-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
				{/if}
			</button>
		</div>

		<!-- Employees list -->
		{#if $employees.length === 0}
			<div class="py-16 text-center">
				<div class="mb-4">
					<svg
						class="mx-auto h-24 w-24 text-base-content/30"
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
				<h3 class="mb-3 text-2xl font-bold">No Employees Yet</h3>
				<p class="mb-6 text-base-content/70">Hire your first employee to start running routes!</p>
				<button class="btn btn-primary btn-lg" on:click={handleHireEmployee} disabled={isHiring}>
					{#if isHiring}
						<span class="loading loading-spinner loading-sm"></span>
						Hiring...
					{:else}
						Hire Your First Employee (Free!)
					{/if}
				</button>
			</div>
		{:else}
			<div class="max-h-[600px] space-y-3 overflow-y-auto pr-2">
				{#each sortedEmployeeData as fed (fed.employee.id)}
					{@const activeJob = fed.activeJob}
					{@const travelJob = fed.travelJob}
					<EmployeeCard
						employee={fed.employee}
						{activeJob}
						{travelJob}
						gameStateId={$currentGameState?.id || ''}
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>
