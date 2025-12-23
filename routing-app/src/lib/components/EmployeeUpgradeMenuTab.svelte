<script lang="ts">
	import { formatMoney } from '$lib/formatting';
	import { getEmployeeCapacity } from '$lib/employeeUtils';
	import {
		VehicleType,
		LicenseType,
		getVehicleConfig,
		getLicenseConfig,
		getNextLicense,
		getNextVehicle
	} from '$lib/upgrades/vehicles';
	import { computeUpgradeCost, getUpgradeInfo } from '$lib/upgrades/upgrades';
	import { JobCategory, CATEGORY_NAMES, CATEGORY_ICONS } from '$lib/jobs/jobCategories';
	import type { Employee } from '$lib/server/db/schema';

	export let employee: Employee | null = null;

	function handlePurchaseLicense(licenseType: LicenseType) {
		// TODO: Implement license purchase
	}

	function handlePurchaseVehicle(vehicleType: VehicleType) {
		// TODO: Implement vehicle purchase
	}

	function handlePurchaseUpgrade(category: JobCategory) {
		// TODO: Implement upgrade purchase
	}
</script>

{#if employee}
	{@const currentVehicleConfig = getVehicleConfig(employee.vehicleLevel)}
	<div class="space-y-6">
		<!-- License Upgrade -->
		<div class="space-y-3">
			<h3 class="text-lg font-semibold">License</h3>
			<div class="rounded-lg bg-base-200 p-3">
				<div class="mb-2 flex items-center justify-between">
					<span>Current: {getLicenseConfig(employee.licenseLevel).name}</span>
					<div class="badge badge-secondary">Level {employee.drivingLevel.level}</div>
				</div>

				{#if getNextLicense(employee.licenseLevel) !== null}
					{@const nextLicense = getNextLicense(employee.licenseLevel)!}
					{@const nextLicenseConfig = getLicenseConfig(nextLicense)}
					{@const canUpgrade = employee.drivingLevel.level >= nextLicenseConfig.minDrivingLevel}

					<button
						class="btn btn-primary btn-sm w-full"
						disabled={!canUpgrade}
						on:click={() => handlePurchaseLicense(nextLicense)}
					>
						{#if canUpgrade}
							Upgrade to {nextLicenseConfig.name} ({formatMoney(nextLicenseConfig.cost)})
						{:else}
							Requires Driving Level {nextLicenseConfig.minDrivingLevel}
						{/if}
					</button>
				{:else}
					<div class="text-center text-success">🏆 Max license achieved!</div>
				{/if}
			</div>
		</div>

		<!-- Vehicle Upgrade -->
		<div class="space-y-3">
			<h3 class="text-lg font-semibold">Vehicle</h3>
			<div class="rounded-lg bg-base-200 p-3">
				<div class="mb-2 flex items-center justify-between">
					<span>Current: {currentVehicleConfig.name}</span>
					<div class="badge badge-accent">{getEmployeeCapacity(employee)} capacity</div>
				</div>

				{#if getNextVehicle(employee.vehicleLevel, employee.licenseLevel) !== null}
					{@const nextVehicle = getNextVehicle(employee.vehicleLevel, employee.licenseLevel)!}
					{@const nextVehicleConfig = getVehicleConfig(nextVehicle)}

					<button
						class="btn btn-primary btn-sm w-full"
						on:click={() => handlePurchaseVehicle(nextVehicle)}
					>
						Upgrade to {nextVehicleConfig.name} ({formatMoney(nextVehicleConfig.baseCost)})
					</button>
				{:else}
					<div class="text-center text-success">🏆 Best available vehicle!</div>
				{/if}
			</div>
		</div>

		<!-- Category Upgrades -->
		<div class="space-y-3">
			<h3 class="text-lg font-semibold">Category Upgrades</h3>
			{#each Object.values(JobCategory).filter((value) => typeof value === 'number') as category}
				{@const upgradeInfo = getUpgradeInfo(category)}
				{@const currentLevel = employee.upgradeState[category]}
				{@const categoryLevel = employee.categoryLevel[category]}
				{@const upgradeCost = computeUpgradeCost(category, currentLevel + 1)}
				{@const canUpgrade = categoryLevel.level > currentLevel}
				{@const categoryName = CATEGORY_NAMES[category]}
				{@const categoryIcon = CATEGORY_ICONS[category]}

				<!-- Calculate current effect -->
				{@const currentEffect = (() => {
					switch (category) {
						case JobCategory.GROCERIES:
							return `${currentLevel * 5}%`;
						case JobCategory.PACKAGES:
							return `${currentLevel * 20}%`;
						case JobCategory.FOOD:
							return `${currentLevel * 5}%`;
						case JobCategory.FURNITURE:
							return `${currentLevel * 5}%`;
						case JobCategory.PEOPLE:
							return `${currentLevel * 10}%`;
						case JobCategory.FRAGILE_GOODS:
							return `+${currentLevel * 5} km/h`;
						case JobCategory.CONSTRUCTION:
							return `${currentLevel * 20}%`;
						case JobCategory.LIQUIDS:
							return `${currentLevel * 5}%`;
						case JobCategory.TOXIC_GOODS:
							return `${currentLevel * 10}%`;
						default:
							return '0%';
					}
				})()}

				<div class="rounded-lg bg-base-200 p-3">
					<div class="mb-2 flex items-center justify-between">
						<span class="flex items-center gap-2 font-medium">
							{categoryIcon}
							{upgradeInfo.name}
						</span>
						<div class="badge badge-ghost">Level {currentLevel}</div>
					</div>

					<p class="mb-2 text-sm text-base-content/70">
						{upgradeInfo.effectDescription} (current: {currentEffect})
					</p>

					<button
						class="btn btn-primary btn-sm w-full"
						disabled={!canUpgrade}
						on:click={() => handlePurchaseUpgrade(category)}
					>
						{#if canUpgrade}
							Upgrade ({formatMoney(upgradeCost)})
						{:else}
							Requires {categoryName} Level {currentLevel + 1}
						{/if}
					</button>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div class="py-8 text-center">
		<div class="mb-2 text-4xl">⚡</div>
		<p class="text-base-content/70">No employee selected</p>
	</div>
{/if}
