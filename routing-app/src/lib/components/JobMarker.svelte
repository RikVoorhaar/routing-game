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

    // Category icons (Unicode symbols)
    const CATEGORY_ICONS = [
        '🛒', // Groceries
        '📦', // Packages
        '🍕', // Food
        '🪑', // Furniture  
        '👥', // People
        '⚠️', // Fragile Goods
        '🏗️', // Construction
        '🧪', // Liquids
        '☠️'  // Toxic Goods
    ];

    function getTierColor(tier: number): string {
        return TIER_COLORS[tier] || TIER_COLORS[0];
    }

    function getCategoryIcon(category: number): string {
        return CATEGORY_ICONS[category] || '📋';
    }

    // Roman numeral conversion
    function toRomanNumeral(tier: number): string {
        const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
        return romanNumerals[tier] || tier.toString();
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div 
    class="relative flex flex-col items-center cursor-pointer transition-all duration-200 hover:scale-110"
    class:scale-125={isSelected}
    style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"
    on:click={onClick}
    title="Tier {job.jobTier} {getCategoryIcon(job.jobCategory)} Job - €{Number(job.approximateValue).toFixed(0)}"
>
    <!-- Compact marker circle -->
    <div 
        class="flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold relative border-2 border-white" 
        style="background-color: {getTierColor(job.jobTier)}"
    >
        <span class="text-[10px] leading-none">{toRomanNumeral(job.jobTier)}</span>
        <span class="absolute -top-1 -right-1 text-[8px]" title="Category: {getCategoryIcon(job.jobCategory)}">{getCategoryIcon(job.jobCategory)}</span>
    </div>
    <!-- Pointer triangle -->
    <div 
        class="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent -mt-px" 
        style="border-top-color: {getTierColor(job.jobTier)}"
    ></div>
</div>

 