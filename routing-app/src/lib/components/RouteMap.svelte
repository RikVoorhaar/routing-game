<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { get } from 'svelte/store';
    import { 
        employees, 
        routesByEmployee, 
        currentGameState
    } from '$lib/stores/gameData';
    import { selectedEmployee, selectEmployee } from '$lib/stores/selectedEmployee';
    import { selectedRoute, selectRoute } from '$lib/stores/selectedRoute';
    import { selectedJob, selectJob } from '$lib/stores/selectedJob';
    import { cheatSettings, activeTiles } from '$lib/stores/cheats';
    import { mapDisplaySettings, displayedRoutes, mapDisplayActions, ROUTE_STYLES } from '$lib/stores/mapDisplay';
    import { MapManager } from './map/MapManager';
    import { JobLoader, type JobLoadResult } from './map/JobLoader';
    import MarkerRenderer from './map/MarkerRenderer.svelte';
    import RouteRenderer from './map/RouteRenderer.svelte';
    import type { Employee, Route, Address } from '$lib/types';
    import { log } from '$lib/logger';

    // Animation configuration
    const ANIMATION_FPS = 30; // Frames per second for smooth animation
    const ANIMATION_INTERVAL_MS = 1000 / ANIMATION_FPS; // ~33ms for 30 FPS

    // Map configuration
    let mapElement: HTMLDivElement;
    let leafletMap: any = null;
    let L: any = null;
    
    // Manager instances
    let mapManager: MapManager | null = null;
    let jobLoader: JobLoader | null = null;
    let markerRenderer: any = null; // Reference to MarkerRenderer component

    // Animation state
    let animationInterval: NodeJS.Timeout | null = null;
    
    // Job loading state
    let jobLoadingTimeout: NodeJS.Timeout | null = null;

    // Reactive updates
    $: {
        if (leafletMap) {
            updateDisplayedRoutes();
        }
    }

    // Reactive updates for selected employee
    $: {
        if (leafletMap && $selectedEmployee) {
            handleEmployeeSelection($selectedEmployee);
        }
    }

    // Reactive updates for selected route
    $: {
        if (leafletMap && $selectedRoute !== undefined) {
            updateDisplayedRoutes();
        }
    }

    async function initMap() {
        if (!browser) return;
        
        try {
            // Initialize map manager
            mapManager = new MapManager(mapElement, loadJobsForVisibleTiles);
            const { map, L: leafletLib } = await mapManager.init();
            leafletMap = map;
            L = leafletLib;
            
            // Initialize job loader
            jobLoader = new JobLoader();
            
            // Initial map update
            updateDisplayedRoutes();
            
            // Load initial jobs (non-blocking)
            loadJobsForVisibleTiles();
            
            // Start animation loop
            startAnimation();
            
        } catch (error) {
            log.error('[RouteMap] Failed to initialize map:', error);
        }
    }

    function updateDisplayedRoutes() {
        if (!leafletMap || !L) return;
        
        // Clear existing routes
        mapDisplayActions.clearRoutes();

        // Draw all active routes for all employees
        $employees.forEach(employee => {
            const employeeRoutes = $routesByEmployee[employee.id];
            const currentRoute = employeeRoutes?.current;
            if (currentRoute && currentRoute.startTime) {
                const isSelected = currentRoute.id === $selectedRoute;
                mapDisplayActions.addRoute(currentRoute, {
                    isSelected,
                    isActive: true,
                    onClick: () => {
                        selectRoute(currentRoute.id);
                        zoomToRoute(currentRoute);
                    }
                });
            }
        });

        // If a selected employee is idle, show their available routes
        if ($selectedEmployee) {
            const employee = $employees.find(emp => emp.id === $selectedEmployee);
            if (employee) {
                const employeeRoutes = $routesByEmployee[employee.id];
                const currentRoute = employeeRoutes?.current;
                const availableRoutes = employeeRoutes?.available || [];
                if (!currentRoute && availableRoutes.length > 0) {
                    showAvailableRoutes(availableRoutes);
                }
            }
        }
    }

    function showAvailableRoutes(routes: Route[]) {
        const allCoords: [number, number][] = [];

        routes.forEach((route) => {
            const isSelected = route.id === $selectedRoute;
            mapDisplayActions.addRoute(route, {
                isSelected,
                isAvailable: true,
                onClick: () => {
                    selectRoute(route.id);
                    zoomToRoute(route);
                }
            });

            // Collect coordinates for bounds calculation
            const routeData = parseRouteData(route.routeData);
            const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon] as [number, number]);
            allCoords.push(...routeCoords);
        });

        // Zoom to fit all available routes
        if (allCoords.length > 0 && L) {
            const bounds = L.latLngBounds(allCoords);
            leafletMap.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    function zoomToRoute(route: Route) {
        if (!leafletMap || !L) return;
        
        const routeData = parseRouteData(route.routeData);
        if (routeData.length > 0) {
            const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon]);
            const bounds = L.latLngBounds(routeCoords);
            leafletMap.fitBounds(bounds, { padding: [20, 20] });
        }
    }

    function parseRouteData(routeDataString: string | object): any[] {
        try {
            if (typeof routeDataString === 'string') {
                return JSON.parse(routeDataString);
            } else if (typeof routeDataString === 'object' && Array.isArray(routeDataString)) {
                return routeDataString;
            } else {
                return [];
            }
        } catch (e) {
            return [];
        }
    }

    function startAnimation() {
        if (animationInterval) {
            clearInterval(animationInterval);
        }
        
        animationInterval = setInterval(() => {
            // Check if any employees are currently traveling
            const hasAnimatedEmployees = $employees.some(employee => {
                const currentRoute = $routesByEmployee[employee.id]?.current;
                return currentRoute && currentRoute.startTime;
            });
            
            if (hasAnimatedEmployees) {
                // Trigger reactivity for marker updates by updating the employees store
                employees.set($employees);
            }
        }, ANIMATION_INTERVAL_MS); // Update every ~33ms for smooth animation
    }

    function handleEmployeeSelection(employeeId: string) {
        const employee = $employees.find(emp => emp.id === employeeId);
        if (!employee || !leafletMap) return;

        const employeeRoutes = $routesByEmployee[employeeId];
        const currentRoute = employeeRoutes?.current;
        const availableRoutes = employeeRoutes?.available || [];

        if (currentRoute && currentRoute.startTime) {
            // Employee is on a route - zoom to show entire route
            zoomToRoute(currentRoute);
        } else if (availableRoutes.length > 0) {
            // Employee is idle but has available routes - show available routes and zoom to fit all
            showAvailableRoutes(availableRoutes);
        } else {
            // Employee is idle with no routes - just pan to employee location
            const position = getEmployeePosition(employee);
            leafletMap.setView([position.lat, position.lon], leafletMap.getZoom());
        }

        // Update displayed routes to show selection
        updateDisplayedRoutes();
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
                log.warn(`[RouteMap] Invalid location data for employee ${employee.name}:`, e);
            }
        }
        return DEFAULT_LOCATION;
    }

    function loadJobsForVisibleTiles() {
        // Clear any existing timeout to debounce the calls
        if (jobLoadingTimeout) {
            clearTimeout(jobLoadingTimeout);
        }
        
        // Debounce job loading by 300ms to avoid excessive calls during panning/zooming
        jobLoadingTimeout = setTimeout(async () => {
            if (!mapManager || !jobLoader) {
                log.warn('[RouteMap] loadJobsForVisibleTiles called but managers not initialized');
                return;
            }

            try {
                const visibleTiles = mapManager.getVisibleTiles();
                const zoomThreshold = get(mapDisplaySettings).jobZoomThreshold;
                
                log.debug('[RouteMap] Loading jobs for tiles:', visibleTiles.length, 'tiles, zoom threshold:', zoomThreshold);
                
                // Load jobs in the background
                const result = await jobLoader.loadJobsForTiles(visibleTiles, zoomThreshold);
                
                // Handle tile-based updates
                if (result) {
                    log.debug('[RouteMap] Tile changes - New tiles:', result.newTiles.length, 'Removed tiles:', result.removedTiles.length);
                    
                    // Handle tile-based rendering directly instead of updating the store
                    if (markerRenderer) {
                        // Remove markers for unloaded tiles
                        result.removedTiles.forEach(tileKey => {
                            if (markerRenderer.clearTileJobs) {
                                markerRenderer.clearTileJobs(tileKey);
                            }
                        });
                        
                        // Add markers for new tiles
                        result.newTiles.forEach(tileKey => {
                            const tileJobs = jobLoader?.getJobsForTile(tileKey) || [];
                            if (markerRenderer.renderTileJobs && tileJobs.length > 0) {
                                markerRenderer.renderTileJobs(tileKey, tileJobs);
                            }
                        });
                    }
                    
                    // Note: No longer updating currentMapJobs store since we're doing tile-based rendering
                } else {
                    log.debug('[RouteMap] No tile changes, skipping job update');
                }
                
            } catch (error) {
                log.error('[RouteMap] Error loading jobs:', error);
            }
        }, 300); // 300ms debounce
    }

    onMount(() => {
        initMap();
    });

    onDestroy(() => {
        if (animationInterval) {
            clearInterval(animationInterval);
        }
        
        if (jobLoadingTimeout) {
            clearTimeout(jobLoadingTimeout);
        }
        
        if (mapManager) {
            mapManager.destroy();
        }
        
        if (jobLoader) {
            jobLoader.clearJobs();
        }
    });
</script>

<!-- Import Leaflet CSS -->
<svelte:head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" 
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" 
          crossorigin="">
</svelte:head>

<div class="map-container">
    <div bind:this={mapElement} class="map-element"></div>
    
    <!-- Render markers and routes -->
    {#if leafletMap && L}
        <MarkerRenderer 
            bind:this={markerRenderer}
            map={leafletMap} 
            {L} 
            employees={$employees} 
            routesByEmployee={$routesByEmployee}
        />
        
        <RouteRenderer 
            map={leafletMap} 
            {L} 
            routes={$displayedRoutes}
        />
    {/if}
</div>

<!-- Tile Debug Display -->
{#if $cheatSettings.showTileDebug}
    <div class="mt-4">
        <div class="card bg-base-200 shadow-sm">
            <div class="card-body p-4">
                <h4 class="card-title text-sm text-base-content/70">
                    🗺️ Active Map Tiles ({$activeTiles.size})
                </h4>
                <div class="flex flex-wrap gap-1 max-h-30 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
                    {#each Array.from($activeTiles).sort() as tile}
                        <span class="badge badge-outline badge-sm">{tile}</span>
                    {/each}
                    {#if $activeTiles.size === 0}
                        <span class="text-base-content/50 text-xs">No active tiles</span>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .map-container {
        width: 100%;
        height: 100%;
        position: relative;
    }

    .map-element {
        width: 100%;
        height: 100%;
        min-height: 400px;
    }
</style> 