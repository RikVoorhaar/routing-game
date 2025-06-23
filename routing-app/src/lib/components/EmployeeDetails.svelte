<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		formatMoney,
		formatAddress,
		formatTimeFromMs,
		formatTime,
		formatDistance
	} from '$lib/formatting';
	import {
		getEmployeeVehicleConfig,
		getEmployeeCapacity,
		canEmployeeDoJobCategory
	} from '$lib/employeeUtils';
	import {
		VehicleType,
		LicenseType,
		getVehicleConfig,
		getLicenseConfig,
		VEHICLE_CONFIGS
	} from '$lib/vehicles';
	import { computeUpgradeCost, getUpgradeInfo } from '$lib/upgrades';
	import { JobCategory, CATEGORY_NAMES, CATEGORY_ICONS } from '$lib/jobCategories';
	import type { Address, Employee, ActiveJob } from '$lib/server/db/schema';

	export let employee: Employee | null = null;
	export let activeJob: ActiveJob | null = null;

	let activeTab: 'route' | 'levels' | 'upgrades' = 'route';

	// Job progress calculation
	$: jobProgress = activeJob && activeJob.startTime ? calculateJobProgress(activeJob) : null;

	function calculateJobProgress(activeJob: ActiveJob) {
		const startTime = new Date(activeJob.startTime!).getTime();
		const currentTime = Date.now();

		// If job is completed (has endTime), return 100%
		if (activeJob.endTime) {
			return {
				progress: 100,
				remainingTimeMs: 0,
				isComplete: true,
				currentPhase: activeJob.currentPhase
			};
		}

		// Calculate progress based on current phase
		let totalProgress = 0;
		let remainingTimeMs = 0;
		let phaseProgress = 0;

		if (activeJob.currentPhase === 'traveling_to_job' && activeJob.modifiedRouteToJobData) {
			// In travel phase
			const travelData = activeJob.modifiedRouteToJobData;
			const travelDuration = travelData.travelTimeSeconds * 1000; // Convert to ms
			const travelElapsed = currentTime - startTime;
			phaseProgress = Math.min(100, (travelElapsed / travelDuration) * 100);

			// If travel is complete, we should be on job now
			if (phaseProgress >= 100) {
				// Transition to job phase (this would normally be handled by server)
				totalProgress = 50; // Halfway through overall job
				// Estimate remaining job time
				const jobData = activeJob.modifiedJobRouteData;
				remainingTimeMs = jobData.travelTimeSeconds * 1000;
			} else {
				// Still traveling
				totalProgress = phaseProgress * 0.5; // Travel is first half
				remainingTimeMs = travelDuration - travelElapsed;
			}
		} else {
			// On job phase (or no travel needed)
			const jobData = activeJob.modifiedJobRouteData;
			const jobDuration = jobData.travelTimeSeconds * 1000;

			let jobStartTime = startTime;
			if (activeJob.jobPhaseStartTime) {
				jobStartTime = new Date(activeJob.jobPhaseStartTime).getTime();
			} else if (activeJob.modifiedRouteToJobData) {
				// Estimate job start time
				jobStartTime = startTime + activeJob.modifiedRouteToJobData.travelTimeSeconds * 1000;
			}

			const jobElapsed = currentTime - jobStartTime;
			phaseProgress = Math.min(100, (jobElapsed / jobDuration) * 100);

			if (activeJob.modifiedRouteToJobData) {
				// Had travel phase, so job is second half
				totalProgress = 50 + phaseProgress * 0.5;
			} else {
				// No travel, job is the whole thing
				totalProgress = phaseProgress;
			}

			remainingTimeMs = Math.max(0, jobDuration - jobElapsed);
		}

		return {
			progress: Math.min(100, totalProgress),
			remainingTimeMs,
			isComplete: totalProgress >= 100,
			currentPhase: activeJob.currentPhase
		};
	}

	function getNextLicense(currentLicense: LicenseType): LicenseType | null {
		const nextLevel = currentLicense + 1;
		return nextLevel <= LicenseType.TOXIC_GOODS ? (nextLevel as LicenseType) : null;
	}

	function getNextVehicle(
		currentVehicle: VehicleType,
		licenseLevel: LicenseType
	): VehicleType | null {
		for (
			let vehicleType = currentVehicle + 1;
			vehicleType <= VehicleType.DOUBLE_TRAILER_TRUCK;
			vehicleType++
		) {
			const config = VEHICLE_CONFIGS[vehicleType as VehicleType];
			if (config.minLicenseLevel <= licenseLevel) {
				return vehicleType as VehicleType;
			}
		}
		return null;
	}

	function getXPForNextLevel(level: number): number {
		return level * 100;
	}

	function handlePurchaseLicense(licenseType: LicenseType) {
		// TODO: Implement license purchase
	}

	function handlePurchaseVehicle(vehicleType: VehicleType) {
		// TODO: Implement vehicle purchase
	}

	function handlePurchaseUpgrade(category: JobCategory) {
		// TODO: Implement upgrade purchase
	}

	// Helper function to format location from route data
	function formatLocation(routeData: any): string {
		if (routeData && routeData.destination) {
			return formatAddress(routeData.destination);
		}
		return 'Unknown location';
	}

	// Helper function to get job details
	function getJobDetails(activeJob: ActiveJob) {
		const jobRouteData = activeJob.modifiedJobRouteData;
		return {
			startLocation: jobRouteData.path?.[0]?.coordinates || null,
			endLocation: jobRouteData.destination || null,
			distance: jobRouteData.totalDistanceMeters || 0,
			duration: jobRouteData.travelTimeSeconds || 0,
			// For now, we don't have goods type and weight in the new system
			// These would come from the job category and tier
			goodsType: 'General Freight',
			weight: 1000 // Placeholder
		};
	}
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
				<div class="space-y-4">
					{#if activeJob}
						{@const jobDetails = getJobDetails(activeJob)}
						<div>
							<div class="mb-2 flex items-center justify-between">
								<span class="font-medium">Job Progress</span>
								<span class="text-sm text-base-content/70">
									{jobProgress ? Math.round(jobProgress.progress) : 0}%
								</span>
							</div>

							<progress
								class="progress progress-primary mb-2 w-full"
								value={jobProgress?.progress || 0}
								max="100"
							></progress>

							{#if jobProgress && !jobProgress.isComplete}
								<div class="text-sm text-base-content/70">
									{#if jobProgress.currentPhase === 'traveling_to_job'}
										Traveling to job location...
									{:else}
										On job...
									{/if}
									ETA: {formatTimeFromMs(jobProgress.remainingTimeMs)}
								</div>
							{:else if jobProgress && jobProgress.isComplete}
								<div class="text-sm font-medium text-success">✅ Job Completed!</div>
							{/if}
						</div>

						<!-- Job Details -->
						<div class="space-y-3">
							<div>
								<strong>From:</strong>
								{formatLocation(activeJob.modifiedJobRouteData)}
							</div>
							<div>
								<strong>To:</strong>
								{formatLocation(activeJob.modifiedJobRouteData)}
							</div>
							<div class="flex justify-between">
								<span><strong>Goods:</strong> {jobDetails.goodsType}</span>
								<span><strong>Weight:</strong> {jobDetails.weight} kg</span>
							</div>
							<div class="flex justify-between">
								<span
									><strong>Distance:</strong>
									{formatDistance(jobDetails.distance)}</span
								>
								<span><strong>Duration:</strong> {formatTime(jobDetails.duration)}</span>
							</div>
						</div>
					{:else}
						<div class="py-8 text-center">
							<div class="mb-2 text-4xl">🚗</div>
							<p class="text-base-content/70">Employee is currently idle</p>
							<p class="mt-1 text-sm text-base-content/50">Assign a job from the job market</p>
						</div>
					{/if}
				</div>
			{:else if activeTab === 'levels'}
				<div class="space-y-4">
					<!-- Driving Level -->
					<div class="rounded-lg bg-base-200 p-3">
						<div class="mb-2 flex items-center justify-between">
							<span class="flex items-center gap-2 font-medium"> 🚗 Driving </span>
							<span class="text-sm">Level {employee.drivingLevel.level}</span>
						</div>
						<progress
							class="progress progress-info w-full"
							value={employee.drivingLevel.xp}
							max={getXPForNextLevel(employee.drivingLevel.level)}
						></progress>
						<div class="mt-1 text-xs text-base-content/70">
							{employee.drivingLevel.xp} / {getXPForNextLevel(employee.drivingLevel.level)} XP
						</div>
					</div>

					<!-- Category Levels -->
					{#each Object.values(JobCategory).filter((value) => typeof value === 'number') as category}
						{@const categoryLevel = employee.categoryLevel[category]}
						{@const canDoCategory = canEmployeeDoJobCategory(employee, category)}
						{@const categoryName = CATEGORY_NAMES[category]}
						{@const categoryIcon = CATEGORY_ICONS[category]}

						<div class="rounded-lg bg-base-200 p-3" class:opacity-60={!canDoCategory}>
							<div class="mb-2 flex items-center justify-between">
								<span class="flex items-center gap-2 font-medium">
									{categoryIcon}
									{categoryName}
									{#if !canDoCategory}
										<svg class="h-4 w-4 text-warning" fill="currentColor" viewBox="0 0 20 20">
											<path
												fill-rule="evenodd"
												d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
												clip-rule="evenodd"
											/>
										</svg>
									{/if}
								</span>
								<span class="text-sm">Level {categoryLevel.level}</span>
							</div>
							<progress
								class="progress w-full"
								class:progress-success={canDoCategory}
								class:progress-warning={!canDoCategory}
								value={categoryLevel.xp}
								max={getXPForNextLevel(categoryLevel.level)}
							></progress>
							<div class="mt-1 text-xs text-base-content/70">
								{categoryLevel.xp} / {getXPForNextLevel(categoryLevel.level)} XP
								{#if !canDoCategory}
									<span class="ml-2 text-warning">Requires license upgrade</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else if activeTab === 'upgrades'}
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
								{@const canUpgrade =
									employee.drivingLevel.level >= nextLicenseConfig.minDrivingLevel}

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
