<script lang="ts">
    import { selectedJob, clearSelectedJob } from '$lib/stores/selectedJob';
    import { getCategoryName, getTierColor } from '$lib/jobCategories';
    import { formatCurrency, formatDistance, formatTime } from '$lib/formatting';
    import type { InferSelectModel } from 'drizzle-orm';
    import type { jobs } from '$lib/server/db/schema';

    type Job = InferSelectModel<typeof jobs>;
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
                        {getCategoryName($selectedJob.jobCategory)}
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

 