<script lang="ts">
	import { canEmployeeDoJobCategory } from '$lib/employeeUtils';
	import { JobCategory, CATEGORY_NAMES, CATEGORY_ICONS } from '$lib/jobs/jobCategories';
	import type { Employee } from '$lib/server/db/schema';

	export let employee: Employee | null = null;

	function getXPForNextLevel(level: number): number {
		return level * 100;
	}
</script>

{#if employee}
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
{:else}
	<div class="py-8 text-center">
		<div class="mb-2 text-4xl">📊</div>
		<p class="text-base-content/70">No employee selected</p>
	</div>
{/if}
