<script lang="ts">
    import { onDestroy } from 'svelte';
    import { interpolateLocationAtTime } from '$lib/routing-client';
    import { formatTimeRemaining, toRomanNumeral } from '$lib/formatting';
    import { getCategoryIcon } from '$lib/jobCategories';
    import { getTierColor } from '$lib/stores/mapDisplay';
    import { selectEmployee } from '$lib/stores/selectedEmployee';
    import { selectedEmployee } from '$lib/stores/selectedEmployee';
    import { selectedJob, selectJob } from '$lib/stores/selectedJob';
    import { DEFAULT_EMPLOYEE_LOCATION } from '$lib/types';
    import { log } from '$lib/logger';
    import type { Employee, Route, PathPoint, Address, Coordinate } from '$lib/types';
    import type { InferSelectModel } from 'drizzle-orm';
    import type { jobs as jobsSchema } from '$lib/server/db/schema';

    type Job = InferSelectModel<typeof jobsSchema>;

    export let map: any;
    export let L: any;
    export let employees: Employee[] = [];
    export let routesByEmployee: Record<string, { available: Route[]; current: Route | null }> = {};
    export let currentJobs: Job[] = [];

    let employeeMarkers: Record<string, any> = {};
    let jobMarkersByTile: Map<string, any[]> = new Map(); // Track markers per tile
    let renderingJobsFrame: number | null = null;
    
    // Expose tile-based job rendering methods
    export function renderTileJobs(tileKey: string, jobs: Job[]) {
        console.log('[MarkerRenderer] Rendering', jobs.length, 'jobs for tile', tileKey);
        
        // Clear existing markers for this tile first
        clearTileJobs(tileKey);
        
        const markers: any[] = [];
        
        jobs.forEach((job) => {
            const marker = createJobMarker(job);
            if (marker) {
                markers.push(marker);
            }
        });
        
        // Store markers for this tile
        jobMarkersByTile.set(tileKey, markers);
        console.log('[MarkerRenderer] Created', markers.length, 'markers for tile', tileKey);
    }

    export function clearTileJobs(tileKey: string) {
        const existingMarkers = jobMarkersByTile.get(tileKey);
        if (existingMarkers) {
            console.log('[MarkerRenderer] Clearing', existingMarkers.length, 'markers for tile', tileKey);
            existingMarkers.forEach(marker => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            jobMarkersByTile.delete(tileKey);
        }
    }

    export function clearAllTileJobs() {
        console.log('[MarkerRenderer] Clearing all job markers');
        for (const [tileKey, markers] of jobMarkersByTile.entries()) {
            markers.forEach(marker => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        jobMarkersByTile.clear();
    }

    // Reactive updates
    $: {
        if (map && L) {
            updateEmployeeMarkers();
        }
    }

    // Reactive updates for jobs - DISABLED for tile-based rendering
    // Jobs are now handled manually via renderTileJobs/clearTileJobs methods
    // $: {
    //     console.log('[MarkerRenderer] Job reactive update triggered, map:', !!map, 'L:', !!L, 'jobs:', currentJobs.length);
    //     
    //     if (map && L) {
    //         updateJobMarkers();
    //     }
    // }

    function updateEmployeeMarkers() {
        // Clear existing markers
        Object.values(employeeMarkers).forEach((marker: any) => {
            if (marker && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        employeeMarkers = {};

        // Add markers for each employee
        employees.forEach(employee => {
            const employeeRoutes = routesByEmployee[employee.id];
            const currentRoute = employeeRoutes?.current;
            
            let position: Coordinate;
            let isAnimated = false;
            let routeData: PathPoint[] = [];
            let progress = 0;
            let eta: string | null = null;

            if (currentRoute && currentRoute.startTime) {
                // Employee is on a route - calculate animated position
                routeData = parseRouteData(currentRoute.routeData);
                
                // Calculate elapsed time since route started
                const startTime = new Date(currentRoute.startTime).getTime();
                const currentTime = Date.now();
                const elapsedSeconds = (currentTime - startTime) / 1000;
                
                // Convert lengthTime to number if it's a string (PostgreSQL numeric fields)
                const routeLengthTime = typeof currentRoute.lengthTime === 'string' ? parseFloat(currentRoute.lengthTime) : currentRoute.lengthTime;
                
                // Calculate progress percentage
                progress = Math.min((elapsedSeconds / routeLengthTime) * 100, 100);
                
                // Calculate ETA
                const remainingSeconds = Math.max(0, routeLengthTime - elapsedSeconds);
                eta = formatTimeRemaining(remainingSeconds);
                
                // Use interpolateLocationAtTime to get current position
                const interpolatedPosition = interpolateLocationAtTime(routeData, elapsedSeconds);
                position = interpolatedPosition || { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                isAnimated = true;
            } else {
                // Employee is idle - use their location or default
                position = getEmployeePosition(employee);
            }

            // Create custom marker with click handler
            const markerIcon = L.divIcon({
                html: createEmployeeMarkerHTML(employee.name, isAnimated, progress, eta, employee.id === $selectedEmployee),
                className: 'custom-employee-marker',
                iconSize: [140, isAnimated ? 80 : 50],
                iconAnchor: [70, isAnimated ? 40 : 25]
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
            const defaultMarker = L.marker([DEFAULT_EMPLOYEE_LOCATION.lat, DEFAULT_EMPLOYEE_LOCATION.lon], {
                title: 'Default Location (Utrecht)'
            }).addTo(map);
            
            employeeMarkers['default'] = defaultMarker;
        }
    }

    function updateJobMarkers() {
        console.log('[MarkerRenderer] updateJobMarkers called with', currentJobs.length, 'jobs');
        
        // Cancel any ongoing rendering
        if (renderingJobsFrame) {
            cancelAnimationFrame(renderingJobsFrame);
            renderingJobsFrame = null;
        }
        
        // Clear all existing job markers
        clearAllJobMarkers();

        // Group jobs by tile
        const jobsByTile = groupJobsByTile(currentJobs);
        
        // Render each tile's jobs
        for (const [tileKey, jobs] of jobsByTile.entries()) {
            renderTileJobs(tileKey, jobs);
        }
    }
    
    function clearAllJobMarkers() {
        // Clear all markers from all tiles
        for (const [tileKey, markers] of jobMarkersByTile.entries()) {
            markers.forEach(marker => {
                if (marker && map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
        }
        jobMarkersByTile.clear();
    }
    
    function groupJobsByTile(jobs: typeof currentJobs): Map<string, typeof currentJobs> {
        const jobsByTile = new Map<string, typeof currentJobs>();
        
        jobs.forEach(job => {
            const tileKey = getJobTileKey(job);
            if (tileKey) {
                if (!jobsByTile.has(tileKey)) {
                    jobsByTile.set(tileKey, []);
                }
                jobsByTile.get(tileKey)!.push(job);
            }
        });
        
        return jobsByTile;
    }
    
    function getJobTileKey(job: typeof currentJobs[number]): string | null {
        try {
            // Parse location (PostGIS EWKT format: "SRID=4326;POINT(lon lat)")
            const locationMatch = job.location.match(/POINT\(([^)]+)\)/);
            if (!locationMatch) return null;

            const [lon, lat] = locationMatch[1].split(' ').map(Number);
            if (isNaN(lat) || isNaN(lon)) return null;

            // Calculate tile coordinates at zoom level 13 (you might want to make this configurable)
            const zoom = 13;
            const tileX = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
            const tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
            
            return `${zoom}/${tileX}/${tileY}`;
        } catch (error) {
            return null;
        }
    }
    
    function renderTileJobs(tileKey: string, jobs: typeof currentJobs) {
        console.log('[MarkerRenderer] Rendering', jobs.length, 'jobs for tile', tileKey);
        
        const markers: any[] = [];
        
        jobs.forEach((job, index) => {
            const marker = createJobMarker(job);
            if (marker) {
                markers.push(marker);
            }
        });
        
        // Store markers for this tile
        jobMarkersByTile.set(tileKey, markers);
    }
    
    function createJobMarker(job: typeof currentJobs[number]) {
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

            // Add click handler
            marker.on('click', () => {
                selectJob(job.id);
            });

            return marker;
        } catch (error) {
            console.warn('Failed to create marker for job:', job.id, error);
            return null;
        }
    }

    function filterJobsByViewport(jobs: typeof currentJobs): typeof currentJobs {
        if (!map || !L) return jobs;
        
        const bounds = map.getBounds();
        if (!bounds) return jobs;

        return jobs.filter(job => {
            try {
                // Parse location (PostGIS EWKT format: "SRID=4326;POINT(lon lat)")
                const locationMatch = job.location.match(/POINT\(([^)]+)\)/);
                if (!locationMatch) return false;

                const [lon, lat] = locationMatch[1].split(' ').map(Number);
                if (isNaN(lat) || isNaN(lon)) return false;

                // Check if the job coordinates are within the current map bounds
                return bounds.contains([lat, lon]);
            } catch (error) {
                return false;
            }
        });
    }

    function renderJobMarkersChunked(jobs: typeof currentJobs, startIndex: number) {
        const CHUNK_SIZE = 20; // Process 20 jobs per frame
        const endIndex = Math.min(startIndex + CHUNK_SIZE, jobs.length);
        
        // Process current chunk
        for (let i = startIndex; i < endIndex; i++) {
            const job = jobs[i];
            
            if (i < 3) {
                console.log('[MarkerRenderer] Processing job', i, ':', job);
                console.log('[MarkerRenderer] Job fields - job_tier:', (job as any).job_tier, 'job_category:', (job as any).job_category, 'jobTier:', job.jobTier, 'jobCategory:', job.jobCategory);
                console.log('[MarkerRenderer] All job keys:', Object.keys(job));
            }
            
            try {
                // Validate essential job fields
                if (!job.location) {
                    console.warn('Job missing location:', job.id);
                    continue;
                }

                // Parse location (PostGIS EWKT format: "SRID=4326;POINT(lon lat)")
                const locationMatch = job.location.match(/POINT\(([^)]+)\)/);
                if (!locationMatch) {
                    console.warn('Invalid location format for job:', job.id, job.location);
                    continue;
                }

                const [lon, lat] = locationMatch[1].split(' ').map(Number);
                if (isNaN(lat) || isNaN(lon)) {
                    console.warn('Invalid coordinates for job:', job.id, lon, lat);
                    continue;
                }

                const isSelected = $selectedJob?.id === job.id;
                const markerHTML = createJobMarkerHTML(job, isSelected);

                const marker = L.marker([lat, lon], {
                    icon: L.divIcon({
                        html: markerHTML,
                        className: 'custom-job-marker',
                        iconSize: [28, 36],
                        iconAnchor: [14, 36]
                    }),
                    title: `Tier ${(job as any).job_tier ?? job.jobTier ?? '?'} Job - €${Number((job as any).approximate_value ?? job.approximateValue ?? 0).toFixed(0)}`
                }).addTo(map);

                // Add click handler
                marker.on('click', () => {
                    selectJob(job);
                    log.info('[MarkerRenderer] Selected job:', job.id);
                });

                jobMarkers.push(marker);

            } catch (error) {
                console.warn('[MarkerRenderer] Failed to create job marker:', error, 'Job:', job);
            }
        }
        
        // Schedule next chunk if there are more jobs to process
        if (endIndex < jobs.length) {
            renderingJobsFrame = requestAnimationFrame(() => {
                renderJobMarkersChunked(jobs, endIndex);
            });
        } else {
            console.log('[MarkerRenderer] Finished creating', jobMarkers.length, 'job markers');
            renderingJobsFrame = null;
        }
    }

    function createEmployeeMarkerHTML(employeeName: string, isAnimated: boolean, progress: number, eta: string | null, isSelected: boolean): string {
        const borderColor = isAnimated ? 'border-green-500' : 'border-gray-500';
        const bgColor = isAnimated ? 'bg-green-50' : 'bg-gray-50';
        const selectedClasses = isSelected ? 'border-red-500 bg-red-50 border-4 scale-110' : 'border-2';
        
        return `
            <div class="flex items-center justify-center min-w-24 px-2 py-1 bg-white shadow-md text-xs font-medium transition-all duration-300 cursor-pointer hover:scale-105 hover:shadow-lg rounded-lg ${borderColor} ${bgColor} ${selectedClasses}">
                <div class="flex flex-col items-center gap-0.5">
                    <span class="font-semibold text-gray-900 whitespace-nowrap">${employeeName}</span>
                    ${isAnimated ? `
                        <div class="w-20 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-green-500 transition-all duration-500 rounded-full" style="width: ${progress}%"></div>
                        </div>
                        <div class="text-xs text-green-600 font-semibold">ETA: ${eta || 'Calculating...'}</div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function createJobMarkerHTML(job: Job, isSelected: boolean): string {
        // Handle both camelCase and snake_case field names
        const jobTier = (job as any).job_tier ?? job.jobTier ?? 1;
        const jobCategory = (job as any).job_category ?? job.jobCategory ?? 0;
        
        const tierColor = getTierColor(jobTier);
        const romanNumeral = toRomanNumeral(jobTier);
        const categoryIcon = getCategoryIcon(jobCategory);
        
        return `
            <div class="relative flex flex-col items-center cursor-pointer transition-all duration-200 hover:scale-110 ${isSelected ? 'scale-125' : ''}" 
                 style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                <!-- Tier badge with background -->
                <div class="absolute -top-2 left-1/2 transform -translate-x-1/2 px-1 rounded text-[9px] font-bold leading-tight z-10" 
                     style="background-color: rgba(0,0,0,0.8); color: ${tierColor}; border: 1px solid ${tierColor};">
                    ${romanNumeral}
                </div>
                <!-- Main marker circle with category icon -->
                <div class="flex items-center justify-center w-7 h-7 rounded-full text-white border-2 border-white relative" 
                     style="background-color: ${tierColor};">
                    <span class="text-sm" title="Category: ${categoryIcon}">${categoryIcon}</span>
                </div>
                <!-- Pointer triangle -->
                <div class="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent" 
                     style="border-top-color: ${tierColor}; margin-top: -1px;"></div>
            </div>
        `;
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

    function getEmployeePosition(employee: Employee): Coordinate {
        if (employee.location) {
            try {
                let locationData: Address;
                if (typeof employee.location === 'string') {
                    locationData = JSON.parse(employee.location);
                } else if (typeof employee.location === 'object') {
                    locationData = employee.location as Address;
                } else {
                    throw new Error('Invalid location format');
                }
                return { lat: locationData.lat, lon: locationData.lon };
            } catch (e) {
                log.warn(`[MarkerRenderer] Invalid location data for employee ${employee.name}:`, e);
            }
        }
        return { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
    }

    onDestroy(() => {
        // Cancel any ongoing rendering
        if (renderingJobsFrame) {
            cancelAnimationFrame(renderingJobsFrame);
            renderingJobsFrame = null;
        }
        
        // Clear all markers when component is destroyed
        Object.values(employeeMarkers).forEach((marker: any) => {
            if (marker && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        jobMarkers.forEach(marker => {
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