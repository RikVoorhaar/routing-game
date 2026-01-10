/**
 * Create marker HTML for employee
 *
 * Parameters
 * -----------
 * name: string
 *     Employee name
 * isAnimated: boolean
 *     Whether the employee is on an active job (animated)
 * progress: number
 *     Progress percentage (0-100)
 * eta: string | null
 *     Estimated time of arrival (null if idle)
 * isSelected: boolean
 *     Whether the employee is currently selected
 *
 * Returns
 * --------
 * string
 *     HTML string for the marker icon
 */
export function createEmployeeMarkerHTML(
	name: string,
	isAnimated: boolean,
	progress: number,
	eta: string | null,
	isSelected: boolean
): string {
	if (isAnimated && eta) {
		// Active employee: circular progress marker with ETA
		const size = 36;
		const strokeWidth = 3;
		const radius = (size - strokeWidth) / 2;
		const circumference = 2 * Math.PI * radius;
		const dashOffset = circumference * (1 - progress / 100);

		const bgColor = isSelected ? '#3b82f6' : '#10b981';
		const progressColor = '#ffffff';

		return `
            <div style="
                width: ${size}px;
                height: ${size}px;
                position: relative;
                cursor: pointer;
            ">
                <svg width="${size}" height="${size}" style="position: absolute; top: 0; left: 0; z-index: 1;">
                    <circle
                        cx="${size / 2}"
                        cy="${size / 2}"
                        r="${radius}"
                        fill="${bgColor}"
                        stroke="rgba(255,255,255,0.3)"
                        stroke-width="${strokeWidth}"
                    />
                    <circle
                        cx="${size / 2}"
                        cy="${size / 2}"
                        r="${radius}"
                        fill="none"
                        stroke="${progressColor}"
                        stroke-width="${strokeWidth}"
                        stroke-linecap="round"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${dashOffset}"
                        transform="rotate(-90 ${size / 2} ${size / 2})"
                        style="transition: stroke-dashoffset 0.3s ease;"
                    />
                </svg>
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 12px;
                    font-weight: bold;
                    text-shadow: 0 0 4px rgba(0,0,0,0.6);
                    z-index: 2;
                    pointer-events: none;
                    line-height: 1;
                ">${eta}</div>
            </div>
        `;
	} else {
		// Idle employee: small gray circle
		const size = 24;
		const bgColor = isSelected ? '#3b82f6' : '#6b7280';
		const scaleTransform = isSelected ? 'scale(1.2)' : 'scale(1)';

		return `
            <div style="
                width: ${size}px;
                height: ${size}px;
                background: ${bgColor};
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                cursor: pointer;
                transform: ${scaleTransform};
                transition: transform 0.2s ease;
            "></div>
        `;
	}
}
