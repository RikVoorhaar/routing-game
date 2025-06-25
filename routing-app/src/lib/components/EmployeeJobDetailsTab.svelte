<script lang="ts">
	import {
		formatMoney,
		formatAddress,
		formatTimeFromMs,
		formatTime,
		formatDistance
	} from '$lib/formatting';
	import { getJobProgress } from '$lib/jobs/jobUtils';
	import type { Employee, ActiveJob } from '$lib/server/db/schema';

	export let activeJob: ActiveJob | null = null;

	// Job progress calculation
	$: jobProgress = activeJob ? getJobProgress(activeJob) : null;

	// Helper function to get job details
	function getJobDetails(activeJob: ActiveJob) {
		return {
			startLocation: null, // Will be populated from addresses if needed
			endLocation: null, // Will be populated from addresses if needed
			distance: 0, // Would need to be calculated from route data
			duration: activeJob.durationSeconds,
			goodsType: 'General Freight', // Placeholder
			weight: 1000 // Placeholder
		};
	}
</script>

<div class="space-y-4">
	{#if activeJob}
		{@const jobDetails = getJobDetails(activeJob)}
		<div>
			<div class="mb-2 flex items-center justify-between">
				<span class="font-medium">Job Progress</span>
				<span class="text-sm text-base-content/70">
					{jobProgress ? Math.round(jobProgress.progressPercent) : 0}%
				</span>
			</div>

			<progress
				class="progress progress-primary mb-2 w-full"
				value={jobProgress?.progressPercent || 0}
				max="100"
			></progress>

			{#if jobProgress && jobProgress.progressPercent < 100}
				<div class="text-sm text-base-content/70">
					Job in progress...
					{#if jobProgress.timeLeftMs}
						ETA: {formatTimeFromMs(jobProgress.timeLeftMs)}
					{/if}
				</div>
			{:else if jobProgress && jobProgress.progressPercent >= 100}
				<div class="text-sm font-medium text-success">✅ Job Completed!</div>
			{/if}
		</div>

		<!-- Job Details -->
		<div class="space-y-3">
			<div class="flex justify-between">
				<span><strong>Category:</strong> {activeJob.jobCategory}</span>
				<span><strong>Reward:</strong> {formatMoney(activeJob.reward)}</span>
			</div>
			<div class="flex justify-between">
				<span><strong>Duration:</strong> {formatTime(jobDetails.duration)}</span>
				<span
					><strong>XP:</strong> {activeJob.drivingXp} driving, {activeJob.categoryXp} category</span
				>
			</div>
			{#if activeJob.startTime}
				<div>
					<strong>Started:</strong>
					{new Date(activeJob.startTime).toLocaleTimeString()}
				</div>
			{/if}
		</div>
	{:else}
		<div class="py-8 text-center">
			<div class="mb-2 text-4xl">🚗</div>
			<p class="text-base-content/70">Employee is currently idle</p>
			<p class="mt-1 text-sm text-base-content/50">Assign a job from the job market</p>
		</div>
	{/if}
</div>
