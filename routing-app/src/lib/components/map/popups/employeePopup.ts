import { getLevelFromXp, getXpForLevel } from '$lib/xp/xpUtils';
import type { Employee } from '$lib/server/db/schema';

export const EMPLOYEE_POPUP_GOTO_PANEL_BUTTON_ID = (employeeId: string) =>
	`employee-goto-panel-${employeeId}`;
export const EMPLOYEE_POPUP_SEARCH_JOBS_BUTTON_ID = (employeeId: string) =>
	`employee-search-jobs-${employeeId}`;
export const EMPLOYEE_POPUP_TRAVEL_BUTTON_ID = (employeeId: string) =>
	`employee-popup-travel-btn-${employeeId}`;

/**
 * Create popup HTML for employee marker
 *
 * Parameters
 * -----------
 * employee: Employee
 *     The employee to create popup for
 * hasActiveJob: boolean
 *     Whether the employee has an active job (to disable travel button)
 *
 * Returns
 * --------
 * string
 *     HTML string for the popup
 */
export function createEmployeePopupHTML(employee: Employee, hasActiveJob: boolean): string {
	const level = getLevelFromXp(employee.xp);
	const xpForCurrentLevel = level >= 0 ? getXpForLevel(level) : 0;
	const xpForNextLevel = level >= 0 && level < 120 ? getXpForLevel(level + 1) : 0;
	const xpProgress =
		typeof employee?.xp === 'number' ? Math.max(0, employee.xp - xpForCurrentLevel) : 0;
	const xpNeeded = xpForNextLevel > xpForCurrentLevel ? xpForNextLevel - xpForCurrentLevel : 1;
	const xpProgressPercent = xpNeeded > 0 ? (xpProgress / xpNeeded) * 100 : 0;

	const travelButtonDisabled = hasActiveJob ? 'disabled' : '';
	const travelButtonStyle = hasActiveJob
		? 'background-color: #9ca3af; cursor: not-allowed; opacity: 0.6;'
		: 'background-color: #f59e0b; cursor: pointer;';
	const travelButtonHover = hasActiveJob
		? ''
		: 'onmouseover="this.style.backgroundColor=\'#d97706\'" onmouseout="this.style.backgroundColor=\'#f59e0b\'"';

	return `
		<div class="employee-popup" style="min-width: 220px; font-family: system-ui, sans-serif;">
			<div style="margin-bottom: 12px;">
				<div style="font-size: 15px; font-weight: 700; margin-bottom: 6px;">${employee.name}</div>
				<div style="display: flex; align-items: center; gap: 6px;">
					<span style="font-size: 12px; font-weight: 600;">Lv ${level}</span>
					<div style="flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
						<div style="height: 100%; background: #3b82f6; width: ${xpProgressPercent}%; transition: width 0.3s;"></div>
					</div>
					<span style="font-size: 10px; color: #888; white-space: nowrap;">${Math.floor(xpProgress)}/${xpNeeded}</span>
				</div>
			</div>

			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
				<button
					id="${EMPLOYEE_POPUP_GOTO_PANEL_BUTTON_ID(employee.id)}"
					style="
						background-color: #3b82f6;
						color: white;
						border: none;
						padding: 8px;
						border-radius: 4px;
						font-size: 12px;
						font-weight: 600;
						cursor: pointer;
					"
					onmouseover="this.style.backgroundColor='#2563eb'"
					onmouseout="this.style.backgroundColor='#3b82f6'"
				>Go to Panel</button>
				<button
					id="${EMPLOYEE_POPUP_SEARCH_JOBS_BUTTON_ID(employee.id)}"
					style="
						background-color: #10b981;
						color: white;
						border: none;
						padding: 8px;
						border-radius: 4px;
						font-size: 12px;
						font-weight: 600;
						cursor: pointer;
					"
					onmouseover="this.style.backgroundColor='#059669'"
					onmouseout="this.style.backgroundColor='#10b981'"
				>Search Jobs</button>
			</div>
			<button
				id="${EMPLOYEE_POPUP_TRAVEL_BUTTON_ID(employee.id)}"
				${travelButtonDisabled}
				style="
					width: 100%;
					${travelButtonStyle}
					color: white;
					border: none;
					padding: 8px;
					border-radius: 4px;
					font-size: 12px;
					font-weight: 600;
				"
				${travelButtonHover}
			>Travel</button>
		</div>
	`;
}
