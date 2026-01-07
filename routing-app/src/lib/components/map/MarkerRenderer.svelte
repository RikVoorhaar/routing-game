<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { interpolateLocationAtTime } from '$lib/routes/routing-client';
	import {
		formatTimeCompact,
		toRomanNumeral,
		formatCurrency,
		formatDistance,
		formatDuration
	} from '$lib/formatting';
	import { getCategoryIcon, getCategoryName } from '$lib/jobs/jobCategories';
	import { getTierColor } from '$lib/stores/mapDisplay';
	import { selectEmployee } from '$lib/stores/selectedEmployee';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { selectedJob, selectJob, setSelectedActiveJobData } from '$lib/stores/selectedJob';
	import { getSearchResultsForEmployee, jobSearchActions } from '$lib/stores/jobSearch';
	import { currentGameState, gameDataActions, gameDataAPI } from '$lib/stores/gameData';
	import { getRoute } from '$lib/stores/routeCache';
	import { addError } from '$lib/stores/errors';
	import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
	import { config } from '$lib/stores/config';
	import { DEFAULT_EMPLOYEE_LOCATION } from '$lib/employeeUtils';
	import { log } from '$lib/logger';
	import type {
		Employee,
		ActiveJob,
		PathPoint,
		Address,
		Coordinate,
		Job
	} from '$lib/server/db/schema';

	export let map: any;
	export let L: any;
	export let employees: Employee[] = [];
	export let activeJobsByEmployee: Record<string, ActiveJob> = {};
	export let routesByEmployee: Record<string, PathPoint[] | null> = {};
	export let animationTimestamp: number = 0;

	let employeeMarkers: Record<string, any> = {};
	let searchResultJobMarkers: any[] = []; // Track search result job markers
	let jobPopupAcceptHandlers: Map<string, () => Promise<void>> = new Map(); // Store accept handlers by job ID

	// Expose search result job rendering method
	export function renderSearchResultJobs(jobs: Job[]) {
		console.log('[MarkerRenderer] Rendering', jobs.length, 'search result jobs');

		// Clear existing search result markers
		clearSearchResultJobs();

		const markers: any[] = [];

		jobs.forEach((job) => {
			const marker = createJobMarker(job);
			if (marker) {
				markers.push(marker);
			}
		});

		// Store markers
		searchResultJobMarkers = markers;
		console.log('[MarkerRenderer] Created', markers.length, 'search result job markers');
	}

	export function clearSearchResultJobs() {
		console.log(
			'[MarkerRenderer] Clearing',
			searchResultJobMarkers.length,
			'search result job markers'
		);
		searchResultJobMarkers.forEach((marker) => {
			if (marker && map.hasLayer(marker)) {
				map.removeLayer(marker);
			}
		});
		searchResultJobMarkers = [];
	}

	// Reactive updates for employees, activeJobsByEmployee, and routesByEmployee
	// This triggers when any of these props change (new employees, job state changes, route updates)
	$: if (map && L && employees && activeJobsByEmployee && routesByEmployee) {
		updateEmployeeMarkers();
	}

	// Reactive update when animation timestamp changes (for position updates)
	$: {
		if (map && L && animationTimestamp > 0) {
			updateEmployeePositions();
		}
	}

	function updateEmployeePositions() {
		// Update positions of existing markers without recreating them
		employees.forEach((employee) => {
			const marker = employeeMarkers[employee.id];
			if (!marker) return;

			const activeJob = activeJobsByEmployee[employee.id];
			if (activeJob && activeJob.startTime) {
				// Calculate elapsed time since job started
				const startTime = new Date(activeJob.startTime).getTime();
				const currentTime = Date.now();
				const elapsedSeconds = (currentTime - startTime) / 1000;

				// Try to interpolate position along route if route data is available
				const routePath = routesByEmployee[employee.id];
				if (routePath && routePath.length > 0) {
					const interpolatedPosition = interpolateLocationAtTime(routePath, elapsedSeconds);
					if (interpolatedPosition) {
						// Update marker position
						marker.setLatLng([interpolatedPosition.lat, interpolatedPosition.lon]);

						// Update progress and ETA for marker title
						const progress = Math.min((elapsedSeconds / activeJob.durationSeconds) * 100, 100);
						const remainingSeconds = Math.max(0, activeJob.durationSeconds - elapsedSeconds);
						const eta = formatTimeCompact(remainingSeconds);

						// Update marker icon with new progress
						const isSelected = employee.id === $selectedEmployee;
						const markerIcon = L.divIcon({
							html: createEmployeeMarkerHTML(employee.name, true, progress, eta, isSelected),
							className: 'custom-employee-marker',
							iconSize: [36, 36],
							iconAnchor: [18, 18]
						});
						marker.setIcon(markerIcon);
						marker.options.title = `${employee.name} (${Math.round(progress)}% complete, ETA: ${eta})`;
					}
				}
			} else {
				// Employee is idle - update marker to show idle state
				// Check if marker currently shows active state (has animated styling)
				const currentIcon = marker.options.icon;
				if (currentIcon && currentIcon.options && currentIcon.options.iconSize) {
					// If icon size is 36 (animated), recreate with idle state
					if (currentIcon.options.iconSize[1] === 36) {
						const position = getEmployeePosition(employee);
						marker.setLatLng([position.lat, position.lon]);

						const isSelected = employee.id === $selectedEmployee;
						const markerIcon = L.divIcon({
							html: createEmployeeMarkerHTML(employee.name, false, 0, null, isSelected),
							className: 'custom-employee-marker',
							iconSize: [24, 24],
							iconAnchor: [12, 12]
						});
						marker.setIcon(markerIcon);
						marker.options.title = `${employee.name} (idle)`;
					}
				}
			}
		});
	}

	// Accept job handler
	async function handleAcceptJob(job: Job, activeJob: ActiveJob | null) {
		const employee = $selectedEmployee;
		const gameState = $currentGameState;

		if (!activeJob || !gameState || !employee) {
			console.error('Missing required data for job acceptance');
			return;
		}

		try {
			const response = await fetch('/api/active-jobs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					activeJobId: activeJob.id,
					gameStateId: gameState.id,
					employeeId: employee
				})
			});

			if (response.ok) {
				const result = await response.json();
				addError('Job accepted successfully!', 'info');

				// Clear all search results for this employee
				if (employee) {
					jobSearchActions.clearSearchResults(employee);
				}

				// Update the global store
				if (employee && result.activeJob) {
					gameDataActions.setEmployeeActiveJob(employee, result.activeJob);
				}

				// Refresh employee data
				try {
					await gameDataAPI.loadAllEmployeeData();
				} catch (error) {
					console.error('Error refreshing employee data:', error);
				}
			} else {
				const errorData = await response.json();
				addError(errorData.message || 'Failed to accept job', 'error');
			}
		} catch (error) {
			console.error('Error accepting job:', error);
			addError('Failed to accept job', 'error');
		}
	}

	// Create popup HTML for job marker
	function createJobPopupHTML(
		job: Job,
		jobTier: number,
		jobCategory: number,
		activeJob: ActiveJob | null
	): string {
		const tierColor = getTierColor(jobTier);
		const categoryName = getCategoryName(jobCategory);
		const configValue = $config;
		const gameState = $currentGameState;

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
						id="accept-job-${job.id}"
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

	function createJobMarker(job: Job) {
		try {
			// Parse location (PostGIS EWKT format: "SRID=4326;POINT(lon lat)")
			const locationMatch = job.location.match(/POINT\(([^)]+)\)/);
			if (!locationMatch) {
				console.warn('Invalid location format for job:', job.id, job.location);
				return null;
			}

			const [lon, lat] = locationMatch[1].split(' ').map(Number);
			if (isNaN(lat) || isNaN(lon)) {
				console.warn('Invalid coordinates for job:', job.id, lon, lat);
				return null;
			}

			// Handle both snake_case and camelCase field names from API
			const jobTier = (job as any).job_tier ?? job.jobTier ?? 1;
			const jobCategory = (job as any).job_category ?? job.jobCategory ?? 1;

			const markerIcon = L.divIcon({
				html: createJobMarkerHTML(job, jobTier, jobCategory),
				className: 'custom-job-marker',
				iconSize: [30, 30],
				iconAnchor: [15, 15]
			});

			const marker = L.marker([lat, lon], {
				icon: markerIcon,
				title: `Job ${job.id} - Tier ${jobTier}`
			}).addTo(map);

			// Find active job for this job from search results
			let activeJob: ActiveJob | null = null;
			const employee = $selectedEmployee;
			if (employee) {
				const searchResultsStore = getSearchResultsForEmployee(employee);
				const searchResults = get(searchResultsStore);
				const result = searchResults?.find((r: any) => r.job.id === job.id);
				activeJob = result?.activeJob || null;
			}

			// Create popup with initial HTML
			const popupContent = createJobPopupHTML(job, jobTier, jobCategory, activeJob);
			console.log('[MarkerRenderer] Creating popup for job', job.id, 'with content:', popupContent.substring(0, 100));
			const popup = L.popup({
				maxWidth: 300,
				className: 'job-tooltip-popup'
			}).setContent(popupContent);

			marker.bindPopup(popup);

			// Also add a direct click handler to ensure popup opens
			marker.on('click', () => {
				console.log('[MarkerRenderer] Job marker clicked:', job.id);
				marker.openPopup();
			});

			// When popup opens, load route and set up accept button handler
			marker.on('popupopen', async () => {
				selectJob(job);

				// Load route if we have an active job
				if (activeJob && activeJob.id && $currentGameState && employee) {
					try {
						const routeData = await getRoute(activeJob.id);

						if (routeData) {
							// Fetch updated active job to get computed duration
							try {
								const updatedActiveJobResponse = await fetch(
									`/api/active-jobs?jobId=${job.id}&gameStateId=${$currentGameState.id}`
								);
								if (updatedActiveJobResponse.ok) {
									const activeJobsList = await updatedActiveJobResponse.json();
									const updatedActiveJob = activeJobsList.find((aj: any) => aj.id === activeJob.id);

									if (updatedActiveJob) {
										// Update popup with duration
										const updatedContent = createJobPopupHTML(
											job,
											jobTier,
											jobCategory,
											updatedActiveJob
										);
										popup.setContent(updatedContent);

										// Set up event listener for Accept button
										setTimeout(() => {
											const acceptButton = document.getElementById(`accept-job-${job.id}`);
											if (acceptButton) {
												acceptButton.onclick = () => {
													handleAcceptJob(job, updatedActiveJob);
													marker.closePopup();
												};
											}
										}, 10);

										// Update selected job data
										setSelectedActiveJobData({
											activeJob: updatedActiveJob,
											employeeStartLocation: updatedActiveJob.employeeStartLocation,
											jobPickupAddress: null,
											jobDeliverAddress: null,
											activeRoute: routeData
										});
									}
								}
							} catch (fetchError) {
								console.warn('Failed to fetch updated active job:', fetchError);
							}
						}
					} catch (error) {
						console.error('Error loading job route:', error);
					}
				} else {
					// Set up event listener for Accept button even if no route loaded yet
					setTimeout(() => {
						const acceptButton = document.getElementById(`accept-job-${job.id}`);
						if (acceptButton && activeJob) {
							acceptButton.onclick = () => {
								handleAcceptJob(job, activeJob);
								marker.closePopup();
							};
						}
					}, 10);
				}
			});

			// Clear selection when popup closes
			marker.on('popupclose', () => {
				// Only clear if this job is still selected
				const currentSelected = $selectedJob;
				if (currentSelected && currentSelected.id === job.id) {
					selectJob(null);
				}
			});

			return marker;
		} catch (error) {
			console.warn('Failed to create marker for job:', job.id, error);
			return null;
		}
	}

	function createJobMarkerHTML(job: Job, jobTier: number, jobCategory: number): string {
		const tierColor = getTierColor(jobTier);
		const categoryIcon = getCategoryIcon(jobCategory);
		const tierRoman = toRomanNumeral(jobTier);
		const isSelected = $selectedJob?.id === job.id;

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

	function updateEmployeeMarkers() {
		// Clear existing markers
		Object.values(employeeMarkers).forEach((marker: any) => {
			if (marker && map.hasLayer(marker)) {
				map.removeLayer(marker);
			}
		});
		employeeMarkers = {};

		// Add markers for each employee
		employees.forEach((employee) => {
			const activeJob = activeJobsByEmployee[employee.id];

			let position: Coordinate;
			let isAnimated = false;
			let routeData: PathPoint[] = [];
			let progress = 0;
			let eta: string | null = null;

			if (activeJob && activeJob.startTime) {
				// Employee is on an active job - calculate animated position
				// Calculate elapsed time since job started
				const startTime = new Date(activeJob.startTime).getTime();
				const currentTime = Date.now();
				const elapsedSeconds = (currentTime - startTime) / 1000;

				// Calculate progress percentage based on job duration
				progress = Math.min((elapsedSeconds / activeJob.durationSeconds) * 100, 100);

				// Calculate ETA
				const remainingSeconds = Math.max(0, activeJob.durationSeconds - elapsedSeconds);
				eta = formatTimeCompact(remainingSeconds);

				// Try to interpolate position along route if route data is available
				const routePath = routesByEmployee[employee.id];
				if (routePath && routePath.length > 0) {
					const interpolatedPosition = interpolateLocationAtTime(routePath, elapsedSeconds);
					if (interpolatedPosition) {
						position = interpolatedPosition;
					} else {
						// Fallback to employee's base location if interpolation fails
						position = getEmployeePosition(employee);
					}
				} else {
					// No route data available, use employee's base location
					position = getEmployeePosition(employee);
				}
				isAnimated = true;
			} else {
				// Employee is idle - use their location or default
				position = getEmployeePosition(employee);
			}

			// Create custom marker with click handler
			const markerIcon = L.divIcon({
				html: createEmployeeMarkerHTML(
					employee.name,
					isAnimated,
					progress,
					eta,
					employee.id === $selectedEmployee
				),
				className: 'custom-employee-marker',
				iconSize: isAnimated ? [36, 36] : [24, 24],
				iconAnchor: isAnimated ? [18, 18] : [12, 12]
			});

			try {
				const marker = L.marker([position.lat, position.lon], {
					icon: markerIcon,
					title: `${employee.name}${isAnimated ? ` (${Math.round(progress)}% complete, ETA: ${eta})` : ' (idle)'}`
				}).addTo(map);

				// Add click handler to marker
				marker.on('click', () => {
					selectEmployee(employee.id);
				});

				employeeMarkers[employee.id] = marker;
			} catch (error) {
				log.warn(`[MarkerRenderer] Failed to create marker for employee ${employee.name}:`, error);
			}
		});

		// If no employees, add a default marker to show the map is working
		if (employees.length === 0) {
			const defaultMarker = L.marker(
				[DEFAULT_EMPLOYEE_LOCATION.lat, DEFAULT_EMPLOYEE_LOCATION.lon],
				{
					title: 'Default Location (Utrecht)'
				}
			).addTo(map);

			employeeMarkers['default'] = defaultMarker;
		}
	}

	function createEmployeeMarkerHTML(
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

	function parseRouteData(routeDataString: string | object): PathPoint[] {
		try {
			if (typeof routeDataString === 'string') {
				return JSON.parse(routeDataString) as PathPoint[];
			} else if (typeof routeDataString === 'object' && Array.isArray(routeDataString)) {
				return routeDataString as PathPoint[];
			} else {
				log.warn('[MarkerRenderer] Invalid route data format:', typeof routeDataString);
				return [];
			}
		} catch (e) {
			log.error('[MarkerRenderer] Failed to parse route data:', e);
			return [];
		}
	}

	function getEmployeePosition(employee: Employee): { lat: number; lon: number } {
		const DEFAULT_LOCATION = { lat: 52.0907, lon: 5.1214 }; // Utrecht, Netherlands

		if (employee.location) {
			try {
				let locationData: Coordinate;
				if (typeof employee.location === 'string') {
					locationData = JSON.parse(employee.location);
				} else if (typeof employee.location === 'object') {
					locationData = employee.location as Coordinate;
				} else {
					throw new Error('Invalid location format');
				}
				return { lat: locationData.lat, lon: locationData.lon };
			} catch (e) {
				log.warn(`[MarkerRenderer] Invalid location data for employee ${employee.name}:`, e);
			}
		}
		return DEFAULT_LOCATION;
	}

	onDestroy(() => {
		// Clear all markers when component is destroyed
		Object.values(employeeMarkers).forEach((marker: any) => {
			if (marker && map.hasLayer(marker)) {
				map.removeLayer(marker);
			}
		});

		// Clear search result job markers
		searchResultJobMarkers.forEach((marker) => {
			if (marker && map.hasLayer(marker)) {
				map.removeLayer(marker);
			}
		});
	});
</script>

<style>
	:global(.custom-employee-marker) {
		background: transparent !important;
		border: none !important;
	}

	:global(.custom-job-marker) {
		background: transparent !important;
		border: none !important;
		z-index: 500;
	}

	:global(.custom-job-marker:hover) {
		z-index: 501;
	}
</style>
