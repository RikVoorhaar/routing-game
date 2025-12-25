<script lang="ts">
	import { currentGameState } from '$lib/stores/gameData';
	import { JobCategory, CATEGORY_NAMES, CATEGORY_ICONS } from '$lib/jobs/jobCategories';
	import { getLevelFromXp, getXpForLevel, MAX_LEVEL } from '$lib/xp/xpUtils';
	import type { CategoryXp } from '$lib/server/db/schema';

	// Get all numeric category values from the enum
	const categories = Object.values(JobCategory).filter(
		(v) => typeof v === 'number'
	) as JobCategory[];

	// Calculate total XP from all categories
	$: categoryXp = ($currentGameState?.xp as CategoryXp | undefined) || ({} as CategoryXp);
	$: totalXp = categories.reduce((sum, cat) => sum + (categoryXp[cat] || 0), 0);
	$: totalLevel = getLevelFromXp(totalXp);

	// Calculate progress to next level for total
	$: totalLevelXp = getXpForLevel(totalLevel);
	$: totalNextLevelXp = totalLevel < MAX_LEVEL ? getXpForLevel(totalLevel + 1) : totalLevelXp;
	$: totalProgress =
		totalLevel >= MAX_LEVEL
			? 100
			: totalNextLevelXp > totalLevelXp
				? ((totalXp - totalLevelXp) / (totalNextLevelXp - totalLevelXp)) * 100
				: 0;
	$: totalXpToNext = totalLevel >= MAX_LEVEL ? 0 : totalNextLevelXp - totalXp;

	// Helper function to calculate level and progress for a category
	function getCategoryStats(category: JobCategory) {
		const xp = categoryXp[category] || 0;
		const level = getLevelFromXp(xp);
		const levelXp = getXpForLevel(level);
		const nextLevelXp = level < MAX_LEVEL ? getXpForLevel(level + 1) : levelXp;
		const progress =
			level >= MAX_LEVEL
				? 100
				: nextLevelXp > levelXp
					? ((xp - levelXp) / (nextLevelXp - levelXp)) * 100
					: 0;
		const xpToNext = level >= MAX_LEVEL ? 0 : nextLevelXp - xp;
		return { xp, level, progress, xpToNext };
	}
</script>

<div class="space-y-4">
	<!-- Total XP Card -->
	<div class="card bg-base-100 shadow">
		<div class="card-body p-4">
			<h3 class="card-title text-lg">Total Experience</h3>
			<div class="stats stats-vertical shadow">
				<div class="stat">
					<div class="stat-title">Total Level</div>
					<div class="stat-value text-primary">{totalLevel}</div>
					<div class="stat-desc">
						{totalXp.toLocaleString()} XP
						{#if totalXpToNext > 0}
							• {totalXpToNext.toLocaleString()} XP to next level
						{:else}
							• Max level reached!
						{/if}
					</div>
				</div>
			</div>
			<div class="mt-2">
				<div class="mb-1 text-xs text-base-content/70">Progress to Level {totalLevel + 1}</div>
				<progress class="progress progress-primary" value={totalProgress} max="100"></progress>
			</div>
		</div>
	</div>

	<!-- Category XP List -->
	<div class="card bg-base-100 shadow">
		<div class="card-body p-4">
			<h3 class="card-title mb-4 text-lg">Category Levels</h3>
			<div class="space-y-3">
				{#each categories as category}
					{@const stats = getCategoryStats(category)}
					<div class="flex items-center gap-3 rounded-lg bg-base-200 p-3">
						<div class="text-2xl">{CATEGORY_ICONS[category]}</div>
						<div class="flex-1">
							<div class="mb-1 flex items-center justify-between">
								<span class="font-semibold">{CATEGORY_NAMES[category]}</span>
								<div class="text-sm text-base-content/70">
									Level {stats.level} • {stats.xp.toLocaleString()} XP
								</div>
							</div>
							<div class="flex items-center gap-2">
								<progress class="progress progress-primary flex-1" value={stats.progress} max="100"
								></progress>
								{#if stats.xpToNext > 0}
									<span class="w-20 text-right text-xs text-base-content/60">
										{stats.xpToNext.toLocaleString()} to {stats.level + 1}
									</span>
								{:else}
									<span class="w-20 text-right text-xs text-base-content/60">Max</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
