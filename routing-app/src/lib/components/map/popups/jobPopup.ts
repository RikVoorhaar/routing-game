import { getTierColor } from '$lib/stores/mapDisplay';
import { getCategoryName } from '$lib/jobs/jobCategories';
import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
import { formatCurrency, formatDistance, formatDuration } from '$lib/formatting';
import type { Job, ActiveJob } from '$lib/server/db/schema';
import type { GameState } from '$lib/server/db/schema';
import type { Config } from '$lib/stores/config';

export const JOB_POPUP_ACCEPT_BUTTON_ID = (jobId: number) => `accept-job-${jobId}`;

/**
 * Create popup HTML for job marker
 *
 * Parameters
 * -----------
 * job: Job
 *     The job to create popup for
 * jobTier: number
 *     The tier of the job
 * jobCategory: number
 *     The category of the job
 * activeJob: ActiveJob | null
 *     The active job if one exists
 * configValue: Config
 *     The game config
 * gameState: GameState
 *     The current game state
 *
 * Returns
 * --------
 * string
 *     HTML string for the popup
 */
export function createJobPopupHTML(
	job: Job,
	jobTier: number,
	jobCategory: number,
	activeJob: ActiveJob | null,
	configValue: Config,
	gameState: GameState
): string {
	const tierColor = getTierColor(jobTier);
	const categoryName = getCategoryName(jobCategory);

	if (!configValue || !gameState) {
		return '<div>Loading...</div>';
	}

	const reward = formatCurrency(computeJobReward(job.totalDistanceKm, configValue, gameState));
	const distance = formatDistance(job.totalDistanceKm);
	const xp = computeJobXp(job, configValue, gameState);
	const duration = activeJob?.durationSeconds ? formatDuration(activeJob.durationSeconds) : '-';
	const canAccept = activeJob && !activeJob.startTime;

	return `
		<div class="job-popup" style="min-width: 250px; font-family: system-ui, sans-serif;">
			<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
				<div style="display: flex; align-items: center; gap: 8px;">
					<span style="
						background-color: ${tierColor};
						color: white;
						padding: 2px 8px;
						border-radius: 4px;
						font-size: 11px;
						font-weight: bold;
					">Tier ${jobTier}</span>
					<span style="font-size: 13px; font-weight: 600;">${categoryName}</span>
				</div>
			</div>

			<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; font-size: 11px;">
				<div style="text-align: center;">
					<div style="color: #888; margin-bottom: 2px;">Distance</div>
					<div style="font-weight: bold; color: #3b82f6;">${distance}</div>
				</div>
				<div style="text-align: center;">
					<div style="color: #888; margin-bottom: 2px;">Duration</div>
					<div style="font-weight: bold; color: #f59e0b;">${duration}</div>
				</div>
				<div style="text-align: center;">
					<div style="color: #888; margin-bottom: 2px;">Value</div>
					<div style="font-weight: bold; color: #10b981;">${reward}</div>
				</div>
				<div style="text-align: center;">
					<div style="color: #888; margin-bottom: 2px;">XP</div>
					<div style="font-weight: bold; color: #8b5cf6;">${xp}</div>
				</div>
				<div style="text-align: center; grid-column: span 2;">
					<div style="color: #888; margin-bottom: 2px;">Category</div>
					<div style="font-weight: bold;">${categoryName}</div>
				</div>
			</div>

			${
				canAccept
					? `
				<button
					id="${JOB_POPUP_ACCEPT_BUTTON_ID(job.id)}"
					style="
						width: 100%;
						background-color: #10b981;
						color: white;
						border: none;
						padding: 8px;
						border-radius: 4px;
						font-size: 13px;
						font-weight: 600;
						cursor: pointer;
					"
					onmouseover="this.style.backgroundColor='#059669'"
					onmouseout="this.style.backgroundColor='#10b981'"
				>Accept Job</button>
			`
					: `
				<div style="text-align: center; color: #888; font-size: 12px; padding: 8px;">
					${activeJob?.startTime ? 'Job already started' : 'Loading...'}
				</div>
			`
			}
		</div>
	`;
}
