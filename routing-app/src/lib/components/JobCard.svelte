<script lang="ts">
    import { selectedJob, clearSelectedJob } from '$lib/stores/selectedJob';
    import type { InferSelectModel } from 'drizzle-orm';
    import type { jobs } from '$lib/server/db/schema';

    type Job = InferSelectModel<typeof jobs>;

    // Job category names mapping
    const CATEGORY_NAMES = [
        'Groceries',
        'Packages', 
        'Food',
        'Furniture',
        'People',
        'Fragile Goods',
        'Construction',
        'Liquids',
        'Toxic Goods'
    ];

    // Tier colors for consistency
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

    function formatCurrency(value: string | number | null | undefined): string {
        if (value == null) return '€0.00';
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(numValue)) return '€0.00';
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency: 'EUR' 
        }).format(numValue);
    }

    function formatDistance(distanceKm: string | number | null | undefined): string {
        if (distanceKm == null) return '0.0 km';
        const numValue = typeof distanceKm === 'string' ? parseFloat(distanceKm) : distanceKm;
        if (isNaN(numValue)) return '0.0 km';
        return `${numValue.toFixed(1)} km`;
    }

    function formatTime(timeSeconds: string | number | null | undefined): string {
        if (timeSeconds == null) return '0m';
        const numValue = typeof timeSeconds === 'string' ? parseFloat(timeSeconds) : timeSeconds;
        if (isNaN(numValue)) return '0m';
        const hours = Math.floor(numValue / 3600);
        const minutes = Math.floor((numValue % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    function getTierColor(tier: number): string {
        return TIER_COLORS[tier] || TIER_COLORS[0];
    }
</script>

{#if $selectedJob}
    <div class="card bg-base-100 shadow-lg border border-base-300">
        <div class="card-body p-4">
            <!-- Header with tier badge and close button -->
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span 
                        class="badge badge-lg text-white font-bold"
                        style="background-color: {getTierColor($selectedJob.jobTier)}"
                    >
                        Tier {$selectedJob.jobTier}
                    </span>
                    <span class="text-lg font-semibold text-base-content">
                        {CATEGORY_NAMES[$selectedJob.jobCategory] || `Category ${$selectedJob.jobCategory}`}
                    </span>
                </div>
                <button 
                    class="btn btn-sm btn-ghost btn-circle"
                    on:click={clearSelectedJob}
                    title="Close job details"
                >
                    ✕
                </button>
            </div>

            <!-- Job details grid -->
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div class="text-center">
                    <div class="text-xs text-base-content/60 font-medium">Reward</div>
                    <div class="text-lg font-bold text-success">
                        {formatCurrency($selectedJob.approximateValue)}
                    </div>
                </div>

                <div class="text-center">
                    <div class="text-xs text-base-content/60 font-medium">Distance</div>
                    <div class="text-lg font-bold text-info">
                        {formatDistance($selectedJob.totalDistanceKm)}
                    </div>
                </div>

                <div class="text-center">
                    <div class="text-xs text-base-content/60 font-medium">Duration</div>
                    <div class="text-lg font-bold text-warning">
                        {formatTime($selectedJob.totalTimeSeconds)}
                    </div>
                </div>

                <div class="text-center">
                    <div class="text-xs text-base-content/60 font-medium">Job ID</div>
                    <div class="text-base font-bold text-base-content">
                        #{$selectedJob.id}
                    </div>
                </div>
            </div>

            <!-- Additional info -->
            <div class="mt-3 text-xs text-base-content/70">
                Posted: {new Date($selectedJob.timeGenerated).toLocaleDateString()}
            </div>
        </div>
    </div>
{/if}

 