<script lang="ts">
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { interpolateLocationAtTime } from '$lib/routes/routing-client';
	import { formatTimeCompact } from '$lib/formatting';
	import { selectEmployee, selectedEmployee } from '$lib/stores/selectedEmployee';
	import { switchToTab } from '$lib/stores/activeTab';
	import { selectedJob, selectJob, setSelectedActiveJobData } from '$lib/stores/selectedJob';
	import { getSearchResultsForEmployee, jobSearchActions } from '$lib/stores/jobSearch';
	import {
		currentGameState,
		gameDataActions,
		gameDataAPI,
		fullEmployeeData
	} from '$lib/stores/gameData';
	import { getRoute } from '$lib/stores/routeCache';
	import { addError } from '$lib/stores/errors';
	import { computeJobXp, computeJobReward } from '$lib/jobs/jobUtils';
	import { config } from '$lib/stores/config';
	import { DEFAULT_EMPLOYEE_LOCATION } from '$lib/employeeUtils';
	import { log } from '$lib/logger';
	import {
		createEmployeePopupHTML,
		EMPLOYEE_POPUP_GOTO_PANEL_BUTTON_ID,
		EMPLOYEE_POPUP_SEARCH_JOBS_BUTTON_ID,
		EMPLOYEE_POPUP_TRAVEL_BUTTON_ID
	} from './popups/employeePopup';
	import { createJobPopupHTML, JOB_POPUP_ACCEPT_BUTTON_ID } from './popups/jobPopup';
	import { createEmployeeMarkerHTML } from './markers/employeeMarker';
	import { createJobMarkerHTML } from './markers/jobMarker';
	import { travelModeActions } from '$lib/stores/travelMode';
	import type {
		Employee,
		ActiveJob,
		PathPoint,
		Place,
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
			const travelJob = $fullEmployeeData.find((fed) => fed.employee.id === employee.id)?.travelJob;
			const hasActiveJob = activeJob && activeJob.startTime;
			const hasTravelJob = travelJob && travelJob.startTime;

			if (hasActiveJob || hasTravelJob) {
				// Use active job if available, otherwise use travel job
				const currentJob = hasActiveJob ? activeJob : travelJob;
				const startTime = new Date(currentJob!.startTime!).getTime();
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
						const durationSeconds = currentJob!.durationSeconds || 0;
						const progress = Math.min((elapsedSeconds / durationSeconds) * 100, 100);
						const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
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

			const isSelected = $selectedJob?.id === job.id;
			const markerIcon = L.divIcon({
				html: createJobMarkerHTML(job, jobTier, jobCategory, isSelected),
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
			const configValue = $config;
			const gameState = $currentGameState;
			const popupContent = createJobPopupHTML(
				job,
				jobTier,
				jobCategory,
				activeJob,
				configValue!,
				gameState!
			);
			console.log(
				'[MarkerRenderer] Creating popup for job',
				job.id,
				'with content:',
				popupContent.substring(0, 100)
			);
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
											updatedActiveJob,
											configValue!,
											gameState!
										);
										popup.setContent(updatedContent);

										// Set up event listener for Accept button
										setTimeout(() => {
											const acceptButton = document.getElementById(
												JOB_POPUP_ACCEPT_BUTTON_ID(job.id)
											);
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
											jobPickupPlace: null,
											jobDeliverPlace: null,
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
						const acceptButton = document.getElementById(JOB_POPUP_ACCEPT_BUTTON_ID(job.id));
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
			const travelJob = $fullEmployeeData.find((fed) => fed.employee.id === employee.id)?.travelJob;

			let position: Coordinate;
			let isAnimated = false;
			let routeData: PathPoint[] = [];
			let progress = 0;
			let eta: string | null = null;

			// Check for active job or travel job
			const hasActiveJob = activeJob && activeJob.startTime;
			const hasTravelJob = travelJob && travelJob.startTime;

			if (hasActiveJob || hasTravelJob) {
				// Employee is on an active job or travel - calculate animated position
				const currentJob = hasActiveJob ? activeJob : travelJob;
				const startTime = new Date(currentJob!.startTime!).getTime();
				const currentTime = Date.now();
				const elapsedSeconds = (currentTime - startTime) / 1000;

				// Calculate progress percentage based on job/travel duration
				const durationSeconds = currentJob!.durationSeconds || 0;
				progress = Math.min((elapsedSeconds / durationSeconds) * 100, 100);

				// Calculate ETA
				const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
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

				// Only create popup for idle employees (not active/traveling)
				if (!hasActiveJob && !hasTravelJob) {
					// Create and bind employee popup
					const hasActiveJobForPopup = !!activeJobsByEmployee[employee.id];
					const popupContent = createEmployeePopupHTML(employee, hasActiveJobForPopup);
					const popup = L.popup({
						maxWidth: 250,
						className: 'employee-tooltip-popup'
					}).setContent(popupContent);

					marker.bindPopup(popup);

					// Set up popup event handlers
					marker.on('popupopen', () => {
						selectEmployee(employee.id);
						// Exit travel mode when employee marker is clicked
						travelModeActions.exitTravelMode();

						// Add button event handlers after popup opens
						setTimeout(() => {
							const gotoPanelButton = document.getElementById(
								EMPLOYEE_POPUP_GOTO_PANEL_BUTTON_ID(employee.id)
							);
							const searchJobsButton = document.getElementById(
								EMPLOYEE_POPUP_SEARCH_JOBS_BUTTON_ID(employee.id)
							);
							const travelButton = document.getElementById(
								EMPLOYEE_POPUP_TRAVEL_BUTTON_ID(employee.id)
							);

							if (gotoPanelButton) {
								gotoPanelButton.onclick = () => {
									switchToTab('employees');
									marker.closePopup();
								};
							}

							if (searchJobsButton) {
								searchJobsButton.onclick = async () => {
									const gameState = get(currentGameState);
									if (!gameState) return;

									try {
										await jobSearchActions.searchJobsForEmployee(employee.id, gameState.id);
										addError(`Found jobs for ${employee.name}!`, 'info', true, 2000);
										marker.closePopup();
									} catch (error) {
										console.error('Error searching jobs:', error);
										addError('Failed to search jobs', 'error');
									}
								};
							}

							if (travelButton) {
								travelButton.onclick = () => {
									const hasActiveJob = !!activeJobsByEmployee[employee.id];
									if (hasActiveJob) {
										addError('Employee must be idle to travel', 'error');
										return;
									}
									travelModeActions.enterTravelMode(employee.id);
									marker.closePopup();
								};
							}
						}, 10);
					});
				}

				// Keep click handler for backwards compatibility
				marker.on('click', () => {
					selectEmployee(employee.id);
					// Exit travel mode when employee marker is clicked
					travelModeActions.exitTravelMode();
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
