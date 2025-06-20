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
    import type { Employee, Route, PathPoint, Address, Coordinate, Job } from '$lib/types';

    export let map: any;
    export let L: any;
    export let employees: Employee[] = [];
    export let routesByEmployee: Record<string, { available: Route[]; current: Route | null }> = {};

    let employeeMarkers: Record<string, any> = {};
    let jobMarkersByTile: Map<string, any[]> = new Map(); // Track markers per tile

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

    // Reactive updates for employees only
    $: {
        if (map && L) {
            updateEmployeeMarkers();
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
                selectJob(job);
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

    function createEmployeeMarkerHTML(name: string, isAnimated: boolean, progress: number, eta: string | null, isSelected: boolean): string {
        const baseStyle = `
            background: ${isSelected ? '#3b82f6' : isAnimated ? '#10b981' : '#6b7280'};
            color: white;
            padding: ${isAnimated ? '8px 12px' : '6px 10px'};
            border-radius: 20px;
            font-weight: bold;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            border: 2px solid white;
            font-size: ${isAnimated ? '11px' : '12px'};
            min-width: ${isAnimated ? '120px' : '80px'};
            cursor: pointer;
            ${isSelected ? 'transform: scale(1.1); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);' : ''}
        `;

        if (isAnimated) {
            return `
                <div style="${baseStyle}">
                    <div style="font-size: 13px; margin-bottom: 2px;">${name}</div>
                    <div style="font-size: 9px; opacity: 0.9;">
                        ${Math.round(progress)}% • ETA: ${eta}
                    </div>
                    <div style="
                        background: rgba(255,255,255,0.3);
                        height: 3px;
                        border-radius: 2px;
                        margin-top: 3px;
                        overflow: hidden;
                    ">
                        <div style="
                            background: white;
                            height: 100%;
                            width: ${progress}%;
                            border-radius: 2px;
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div style="${baseStyle}">
                    ${name}
                    <div style="font-size: 9px; opacity: 0.8; margin-top: 1px;">idle</div>
                </div>
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
        return DEFAULT_LOCATION;
    }

    onDestroy(() => {
        // Clear all markers when component is destroyed
        Object.values(employeeMarkers).forEach((marker: any) => {
            if (marker && map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        
        clearAllTileJobs();
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