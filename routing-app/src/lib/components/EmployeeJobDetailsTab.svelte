<script lang="ts">
	import {
		formatMoney,
		formatAddress,
		formatTimeFromMs,
		formatTime,
		formatDistance
	} from '$lib/formatting';
	import { JobCategory } from '$lib/jobs/jobCategories';
	import { getJobProgress } from '$lib/jobs/jobUtils';
	import type { ActiveJob, Address, ActiveRoute } from '$lib/server/db/schema';

	export let activeJob: ActiveJob | null = null;
	export let employeeStartAddress: Address | null = null;
	export let jobAddress: Address | null = null;
	export let employeeEndAddress: Address | null = null;
	export let activeRoute: ActiveRoute | null = null;

	// Job progress calculation
	$: jobProgress = activeJob ? getJobProgress(activeJob) : null;

	// Helper function to get job details with route data
	function getJobDetails(
		activeJob: ActiveJob,
		activeRoute: ActiveRoute | null
	): {
		distance: number;
		duration: number;
		jobCategory: JobCategory;
	} {
		const routeData = activeRoute?.routeData;
		return {
			distance: routeData ? routeData.totalDistanceMeters / 1000 : 0, // Convert to km
			duration: activeJob.durationSeconds,
			jobCategory: activeJob.jobCategory as JobCategory
		};
	}
</script>

<div class="space-y-4">
	{#if activeJob}
		{@const jobDetails = getJobDetails(activeJob, activeRoute)}
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
			{#if jobDetails.distance > 0}
				<div>
					<strong>Distance:</strong>
					{formatDistance(jobDetails.distance * 1000)}
					<!-- Convert back to meters for formatting -->
				</div>
			{/if}
			{#if activeJob.startTime}
				<div>
					<strong>Started:</strong>
					{new Date(activeJob.startTime).toLocaleTimeString()}
				</div>
			{/if}
		</div>

		<!-- Address Information -->
		{#if employeeStartAddress || jobAddress || employeeEndAddress}
			<div class="divider">Route Details</div>
			<div class="space-y-2">
				{#if employeeStartAddress}
					<div class="flex items-start gap-2">
						<div class="badge badge-outline badge-sm mt-1">START</div>
						<div class="text-sm">
							<div class="font-medium">Employee Start Location</div>
							<div class="text-base-content/70">{formatAddress(employeeStartAddress)}</div>
						</div>
					</div>
				{/if}
				{#if jobAddress}
					<div class="flex items-start gap-2">
						<div class="badge badge-primary badge-sm mt-1">JOB</div>
						<div class="text-sm">
							<div class="font-medium">Job Location</div>
							<div class="text-base-content/70">{formatAddress(jobAddress)}</div>
						</div>
					</div>
				{/if}
				{#if employeeEndAddress}
					<div class="flex items-start gap-2">
						<div class="badge badge-success badge-sm mt-1">END</div>
						<div class="text-sm">
							<div class="font-medium">Employee End Location</div>
							<div class="text-base-content/70">{formatAddress(employeeEndAddress)}</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Route Information -->
		{#if activeRoute}
			<div class="divider">Route Information</div>
			<div class="space-y-2">
				<div class="flex justify-between text-sm">
					<span><strong>Total Distance:</strong></span>
					<span>{formatDistance(activeRoute.routeData.totalDistanceMeters)}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span><strong>Travel Time:</strong></span>
					<span>{formatTime(activeRoute.routeData.travelTimeSeconds)}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span><strong>Route Points:</strong></span>
					<span>{activeRoute.routeData.path.length} waypoints</span>
				</div>
			</div>
		{/if}
	{:else}
		<div class="py-8 text-center">
			<div class="mb-2 text-4xl">🚗</div>
			<p class="text-base-content/70">Employee is currently idle</p>
			<p class="mt-1 text-sm text-base-content/50">Assign a job from the job market</p>
		</div>
	{/if}
</div>
