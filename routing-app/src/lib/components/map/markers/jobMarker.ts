import { getTierColor } from '$lib/stores/mapDisplay';
import { getCategoryIcon } from '$lib/jobs/jobCategories';
import { toRomanNumeral } from '$lib/formatting';
import type { Job } from '$lib/server/db/schema';

/**
 * Create marker HTML for job
 *
 * Parameters
 * -----------
 * job: Job
 *     The job to create marker for
 * jobTier: number
 *     The tier of the job
 * jobCategory: number
 *     The category of the job
 * isSelected: boolean
 *     Whether the job is currently selected
 *
 * Returns
 * --------
 * string
 *     HTML string for the marker icon
 */
export function createJobMarkerHTML(
	job: Job,
	jobTier: number,
	jobCategory: number,
	isSelected: boolean
): string {
	const tierColor = getTierColor(jobTier);
	const categoryIcon = getCategoryIcon(jobCategory);
	const tierRoman = toRomanNumeral(jobTier);

	return `
        <div class="job-marker ${isSelected ? 'selected' : ''}" 
             style="
                 background: ${tierColor}; 
                 border: 2px solid ${isSelected ? '#ffffff' : 'rgba(0,0,0,0.3)'};
                 border-radius: 50%;
                 width: 26px;
                 height: 26px;
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 font-size: 12px;
                 font-weight: bold;
                 color: white;
                 text-shadow: 0 1px 2px rgba(0,0,0,0.7);
                 cursor: pointer;
                 box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                 ${isSelected ? 'transform: scale(1.2); box-shadow: 0 0 0 3px rgba(255,255,255,0.8);' : ''}
             ">
            ${categoryIcon}
            <div style="
                position: absolute;
                bottom: -8px;
                right: -8px;
                background: rgba(0,0,0,0.8);
                color: white;
                border-radius: 8px;
                padding: 1px 4px;
                font-size: 8px;
                font-weight: bold;
                line-height: 1;
                min-width: 12px;
                text-align: center;
            ">${tierRoman}</div>
        </div>
    `;
}
