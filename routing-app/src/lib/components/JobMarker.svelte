<script lang="ts">
    import type { InferSelectModel } from 'drizzle-orm';
    import type { jobs } from '$lib/server/db/schema';

    type Job = InferSelectModel<typeof jobs>;

    export let job: Job;
    export let isSelected: boolean = false;
    export let onClick: (() => void) | undefined = undefined;

    // Tier colors for consistency with JobCard
    const TIER_COLORS = [
        '#6b7280', // tier 0 (shouldn't exist)
        '#10b981', // tier 1 - green
        '#3b82f6', // tier 2 - blue  
        '#8b5cf6', // tier 3 - purple
        '#f59e0b', // tier 4 - amber
        '#ef4444', // tier 5 - red
        '#ec4899', // tier 6 - pink
        '#8b5cf6', // tier 7 - violet
        '#1f2937'  // tier 8 - dark gray
    ];

    function getTierColor(tier: number): string {
        return TIER_COLORS[tier] || TIER_COLORS[0];
    }

    function formatCurrency(value: string | number): string {
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (numValue >= 1000) {
            return `€${(numValue / 1000).toFixed(1)}k`;
        }
        return `€${numValue.toFixed(0)}`;
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div 
    class="flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg cursor-pointer transition-all duration-200 hover:scale-110 hover:shadow-xl min-w-16 max-w-24 px-2 py-1"
    class:border-4={isSelected}
    class:border-2={!isSelected}
    class:scale-115={isSelected}
    class:border-solid={job.jobTier <= 3}
    class:border-dashed={job.jobTier > 3 && job.jobTier <= 5}
    class:border-dotted={job.jobTier > 5 && job.jobTier <= 7}
    class:border-double={job.jobTier > 7}
    style="border-color: {getTierColor(job.jobTier)}; background-color: {getTierColor(job.jobTier)}15"
    on:click={onClick}
    title="Tier {job.jobTier} Job - {formatCurrency(job.approximateValue)}"
>
    <div 
        class="flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold flex-shrink-0" 
        style="background-color: {getTierColor(job.jobTier)}"
    >
        {job.jobTier}
    </div>
    <div class="flex flex-col items-center flex-1 min-w-0">
        <div class="text-xs font-bold text-green-600 truncate w-full text-center">
            {formatCurrency(job.approximateValue)}
        </div>
    </div>
</div>

 