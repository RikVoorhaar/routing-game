<script lang="ts">
	import { getVehicleConfig } from '$lib/upgrades/vehicles';
	import { selectedFullEmployeeData } from '$lib/stores/selectedEmployee';
	import EmployeeJobDetailsTab from './EmployeeJobDetailsTab.svelte';
	import EmployeeLevelStatusTab from './EmployeeLevelStatusTab.svelte';
	import EmployeeUpgradeMenuTab from './EmployeeUpgradeMenuTab.svelte';

	let activeTab: 'route' | 'levels' | 'upgrades' = 'route';

	// Extract data from selectedFullEmployeeData store
	$: employee = $selectedFullEmployeeData?.employee || null;
	$: activeJob = $selectedFullEmployeeData?.activeJob || null;
	$: employeeStartAddress = $selectedFullEmployeeData?.employeeStartAddress || null;
	$: jobAddress = $selectedFullEmployeeData?.jobAddress || null;
	$: employeeEndAddress = $selectedFullEmployeeData?.employeeEndAddress || null;
	$: activeRoute = $selectedFullEmployeeData?.activeRoute || null;
</script>

{#if employee}
	<div class="card bg-base-100 shadow-lg">
		<div class="card-body p-4">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="card-title text-xl">{employee.name}</h2>
				<div class="badge badge-primary">{getVehicleConfig(employee.vehicleLevel).name}</div>
			</div>

			<!-- Tabs -->
			<div class="tabs-boxed tabs mb-4">
				<button
					class="tab"
					class:tab-active={activeTab === 'route'}
					on:click={() => (activeTab = 'route')}
				>
					Route
				</button>
				<button
					class="tab"
					class:tab-active={activeTab === 'levels'}
					on:click={() => (activeTab = 'levels')}
				>
					Levels
				</button>
				<button
					class="tab"
					class:tab-active={activeTab === 'upgrades'}
					on:click={() => (activeTab = 'upgrades')}
				>
					Upgrades
				</button>
			</div>

			<!-- Tab Content -->
			{#if activeTab === 'route'}
				<EmployeeJobDetailsTab
					{activeJob}
					{employeeStartAddress}
					{jobAddress}
					{employeeEndAddress}
					{activeRoute}
				/>
			{:else if activeTab === 'levels'}
				<EmployeeLevelStatusTab {employee} />
			{:else if activeTab === 'upgrades'}
				<EmployeeUpgradeMenuTab {employee} />
			{/if}
		</div>
	</div>
{:else}
	<div class="card bg-base-100 shadow-lg">
		<div class="card-body p-8 text-center">
			<div class="mb-4 text-4xl">👥</div>
			<h3 class="mb-2 text-xl font-bold">No Employee Selected</h3>
			<p class="text-base-content/70">Click on an employee to view their details</p>
		</div>
	</div>
{/if}
