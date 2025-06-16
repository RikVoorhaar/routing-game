<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { 
        employees, 
        routesByEmployee, 
        currentGameState 
    } from '$lib/stores/gameData';
    import { selectedEmployee, selectEmployee } from '$lib/stores/selectedEmployee';
    import { selectedRoute, selectRoute } from '$lib/stores/selectedRoute';
    import { cheatSettings, activeTiles, cheatActions } from '$lib/stores/cheats';
    import { interpolateLocationAtTime } from '$lib/routing-client';
    import type { Employee, Route, PathPoint, Address, Coordinate } from '$lib/types';
    import { DEFAULT_EMPLOYEE_LOCATION } from '$lib/types';
    import { log } from '$lib/logger';

    // Animation configuration
    const ANIMATION_FPS = 30; // Frames per second for smooth animation
    const ANIMATION_INTERVAL_MS = 1000 / ANIMATION_FPS; // ~33ms for 30 FPS

    // Map configuration
    let mapElement: HTMLDivElement;
    let leafletMap: any = null;
    let L: any = null;
    let employeeMarkers: Record<string, any> = {};
    let routePolylines: Record<string, any> = {};
    let availableRoutePolylines: any[] = []; // For showing available routes
    let tileLayer: any = null; // Reference to the tile layer for event handling

    // Animation state
    let animationInterval: NodeJS.Timeout | null = null;

    // Reactive updates
    $: {
        if (leafletMap) {
            updateMap();
        }
    }

    // Reactive updates for selected employee
    $: {
        if (leafletMap && $selectedEmployee) {
            handleEmployeeSelection($selectedEmployee);
        }
    }

    // --- Reactivity for selectedRoute ---
    $: {
        if (leafletMap && $selectedRoute !== undefined) {
            // When the selected route changes, update the map immediately
            updateMap();
        }
    }

    async function initMap() {
        if (!browser) return;
        
        try {
            // Import Leaflet dynamically
            L = (await import('leaflet')).default;
            
            // Fix default marker icons
            // @ts-ignore
            delete L.Icon.Default.prototype._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
                iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            });

            log.info('[RouteMap] Creating Leaflet map');
            
            // Create map
            leafletMap = L.map(mapElement, {
                center: [52.0907, 5.1214], // Utrecht, Netherlands
                zoom: 13,
                zoomControl: true,
                attributionControl: true
            });

            // Add tile layer
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 17
            }).addTo(leafletMap);

            // Setup tile event listeners for debugging
            setupTileDebugListeners();
            
            // Initial map update
            updateMap();
            
            // Start animation loop
            startAnimation();
            
        } catch (error) {
            log.error('[RouteMap] Failed to initialize map:', error);
        }
    }

    function updateMap() {
        if (!leafletMap || !L) return;
        
        // Clear existing markers and polylines
        Object.values(employeeMarkers).forEach((marker: any) => {
            if (marker && leafletMap.hasLayer(marker)) {
                leafletMap.removeLayer(marker);
            }
        });
        Object.values(routePolylines).forEach((polyline: any) => {
            if (polyline && leafletMap.hasLayer(polyline)) {
                leafletMap.removeLayer(polyline);
            }
        });
        
        // Clear the tracking objects completely
        employeeMarkers = {};
        routePolylines = {};
        
        clearAvailableRoutes();

        // Draw all active routes for all employees
        $employees.forEach(employee => {
            const employeeRoutes = $routesByEmployee[employee.id];
            const currentRoute = employeeRoutes?.current;
            if (currentRoute && currentRoute.startTime) {
                // If this is the selected route, mark as selected
                const isSelected = currentRoute.id === $selectedRoute;
                routePolylines[employee.id] = showRouteOnMap(currentRoute, {
                    isSelected,
                    isAvailable: false,
                    isActive: true,
                    onClick: () => {
                        selectRoute(currentRoute.id);
                        // Pan and zoom to the route
                        const routeData = parseRouteData(currentRoute.routeData);
                        const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon]);
                        const bounds = L.latLngBounds(routeCoords);
                        leafletMap.fitBounds(bounds, { padding: [20, 20] });
                    }
                });
            }
        });

        // Add markers for each employee
        $employees.forEach(employee => {
            const employeeRoutes = $routesByEmployee[employee.id];
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
                if (employee.location) {
                    try {
                        // Handle both SQLite (string) and PostgreSQL (object) formats
                        let locationData: Address;
                        if (typeof employee.location === 'string') {
                            // SQLite format - parse JSON string
                            locationData = JSON.parse(employee.location);
                        } else if (typeof employee.location === 'object') {
                            // PostgreSQL format - already an object
                            locationData = employee.location as Address;
                        } else {
                            throw new Error('Invalid location format');
                        }
                        position = { lat: locationData.lat, lon: locationData.lon };
                    } catch (e) {
                        log.warn(`[RouteMap] Invalid location data for employee ${employee.name}:`, e);
                        position = { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                    }
                } else {
                    position = { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                }
            }

            // Create custom marker with click handler
            const markerIcon = L.divIcon({
                html: createMarkerHTML(employee.name, isAnimated, progress, eta, employee.id === $selectedEmployee),
                className: 'custom-employee-marker',
                iconSize: [140, isAnimated ? 80 : 50],
                iconAnchor: [70, isAnimated ? 40 : 25]
            });

            try {
                const marker = L.marker([position.lat, position.lon], {
                    icon: markerIcon,
                    title: `${employee.name}${isAnimated ? ` (${Math.round(progress)}% complete, ETA: ${eta})` : ' (idle)'}`
                }).addTo(leafletMap);

                // Add click handler to marker
                marker.on('click', () => {
                    selectEmployee(employee.id);
                });

                employeeMarkers[employee.id] = marker;
            } catch (error) {
                log.warn(`[RouteMap] Failed to create marker for employee ${employee.name}:`, error);
                // Don't store null/undefined markers
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
                    showAvailableRoutes(availableRoutes, employee);
                }
            }
        }

        // If no employees, add a default marker to show the map is working
        if ($employees.length === 0) {
            const defaultMarker = L.marker([DEFAULT_EMPLOYEE_LOCATION.lat, DEFAULT_EMPLOYEE_LOCATION.lon], {
                title: 'Default Location (Utrecht)'
            }).addTo(leafletMap);
            
            employeeMarkers['default'] = defaultMarker;
        }
    }

    function createMarkerHTML(employeeName: string, isAnimated: boolean, progress: number, eta: string | null, isSelected: boolean): string {
        return `
            <div class="employee-marker ${isAnimated ? 'animated' : 'idle'} ${isSelected ? 'selected' : ''}">
                <div class="marker-content">
                    <span class="employee-name">${employeeName}</span>
                    ${isAnimated ? `
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="eta">ETA: ${eta || 'Calculating...'}</div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function formatTimeRemaining(seconds: number | string): string {
        const numericSeconds = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
        if (numericSeconds <= 0) return 'Arriving';
        
        const hours = Math.floor(numericSeconds / 3600);
        const minutes = Math.floor((numericSeconds % 3600) / 60);
        const remainingSeconds = Math.floor(numericSeconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    }

    function parseRouteData(routeDataString: string | object): PathPoint[] {
        try {
            if (typeof routeDataString === 'string') {
                // SQLite format - parse JSON string
                return JSON.parse(routeDataString) as PathPoint[];
            } else if (typeof routeDataString === 'object' && Array.isArray(routeDataString)) {
                // PostgreSQL format - already an array
                return routeDataString as PathPoint[];
            } else {
                log.warn('[RouteMap] Invalid route data format:', typeof routeDataString);
                return [];
            }
        } catch (e) {
            log.error('[RouteMap] Failed to parse route data:', e);
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
                updateMap();
            }
        }, ANIMATION_INTERVAL_MS); // Update every ~33ms for smooth animation
    }

    function handleEmployeeSelection(employeeId: string) {
        const employee = $employees.find(emp => emp.id === employeeId);
        if (!employee) return;

        const employeeRoutes = $routesByEmployee[employeeId];
        const currentRoute = employeeRoutes?.current;
        const availableRoutes = employeeRoutes?.available || [];

        // Clear existing available route displays
        clearAvailableRoutes();

        if (currentRoute && currentRoute.startTime) {
            // Employee is on a route - zoom to show entire route
            const routeData = parseRouteData(currentRoute.routeData);
            if (routeData.length > 0) {
                const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon]);
                const bounds = L.latLngBounds(routeCoords);
                leafletMap.fitBounds(bounds, { padding: [20, 20] });
            }
        } else if (availableRoutes.length > 0) {
            // Employee is idle but has available routes - show available routes and zoom to fit all
            showAvailableRoutes(availableRoutes, employee);
        } else {
            // Employee is idle with no routes - just pan to employee location
            const position = getEmployeePosition(employee);
            leafletMap.setView([position.lat, position.lon], leafletMap.getZoom());
        }

        // Update markers to show selection
        updateMap();
    }

    function showAvailableRoutes(routes: Route[], employee: Employee) {
        const allCoords: [number, number][] = [];

        routes.forEach((route, index) => {
            const polyline = showRouteOnMap(route, {
                isSelected: route.id === $selectedRoute,
                isAvailable: true,
                onClick: () => {
                    selectRoute(route.id);
                    // Pan and zoom to the route
                    const routeData = parseRouteData(route.routeData);
                    const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon]);
                    const bounds = L.latLngBounds(routeCoords);
                    leafletMap.fitBounds(bounds, { padding: [20, 20] });
                }
            });
            if (polyline) {
                const routeData = parseRouteData(route.routeData);
                const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon] as [number, number]);
                allCoords.push(...routeCoords);

                // Add popup with route info
                const startLocation = (() => {
                    try {
                        if (typeof route.startLocation === 'string') {
                            return JSON.parse(route.startLocation) as Address;
                        } else if (typeof route.startLocation === 'object') {
                            return route.startLocation as Address;
                        } else {
                            return { city: 'Unknown' } as Address;
                        }
                    } catch (e) {
                        return { city: 'Unknown' } as Address;
                    }
                })();
                const endLocation = (() => {
                    try {
                        if (typeof route.endLocation === 'string') {
                            return JSON.parse(route.endLocation) as Address;
                        } else if (typeof route.endLocation === 'object') {
                            return route.endLocation as Address;
                        } else {
                            return { city: 'Unknown' } as Address;
                        }
                    } catch (e) {
                        return { city: 'Unknown' } as Address;
                    }
                })();
                const rewardFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(
                    typeof route.reward === 'string' ? parseFloat(route.reward) : route.reward
                );
                polyline.bindPopup(`
                    <div>
                        <strong>Available Route ${index + 1}</strong><br>
                        From: ${startLocation.city || 'Unknown'}<br>
                        To: ${endLocation.city || 'Unknown'}<br>
                        Duration: ${formatTimeRemaining(route.lengthTime)}<br>
                        Reward: ${rewardFormatted}<br>
                        Goods: ${route.goodsType}
                    </div>
                `);
                availableRoutePolylines.push(polyline);
            }
        });

        // Zoom to fit all available routes
        if (allCoords.length > 0) {
            const bounds = L.latLngBounds(allCoords);
            leafletMap.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    function clearAvailableRoutes() {
        availableRoutePolylines.forEach(polyline => {
            if (polyline && leafletMap.hasLayer(polyline)) {
                leafletMap.removeLayer(polyline);
            }
        });
        availableRoutePolylines = [];
    }

    function getEmployeePosition(employee: Employee): Coordinate {
        if (employee.location) {
            try {
                // Handle both SQLite (string) and PostgreSQL (object) formats
                let locationData: Address;
                if (typeof employee.location === 'string') {
                    // SQLite format - parse JSON string
                    locationData = JSON.parse(employee.location);
                } else if (typeof employee.location === 'object') {
                    // PostgreSQL format - already an object
                    locationData = employee.location as Address;
                } else {
                    throw new Error('Invalid location format');
                }
                return { lat: locationData.lat, lon: locationData.lon };
            } catch (e) {
                log.warn(`[RouteMap] Invalid location data for employee ${employee.name}:`, e);
            }
        }
        return { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
    }

    // --- Route Polyline Drawing Helper ---
    // Refined: isSelected > isAvailable > isActive (mutually exclusive)
    function showRouteOnMap(route: Route, {
        isSelected = false,
        isAvailable = false,
        isActive = false,
        onClick = undefined
    }: {
        isSelected?: boolean,
        isAvailable?: boolean,
        isActive?: boolean,
        onClick?: (() => void) | undefined
    } = {}) {
        const routeData = parseRouteData(route.routeData);
        if (routeData.length === 0) return null;
        const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon]);
        let color = '#3b82f6'; // default: active
        let weight = 5;
        let opacity = 0.8;
        let dashArray = undefined;
        if (isSelected) {
            color = '#dc2626'; // red
            weight = 7;
            opacity = 0.95;
            dashArray = undefined;
        } else if (isAvailable) {
            color = '#f59e0b'; // orange
            weight = 4;
            opacity = 0.7;
            dashArray = undefined; // Make available routes solid
        } else if (isActive) {
            color = '#3b82f6'; // blue
            weight = 5;
            opacity = 0.8;
            dashArray = undefined;
        }
        const polyline = L.polyline(routeCoords, {
            color,
            weight,
            opacity,
            dashArray
        }).addTo(leafletMap);
        if (onClick) {
            polyline.on('click', onClick);
        }
        return polyline;
    }

    function setupTileDebugListeners() {
        if (!leafletMap || !L) return;

        // Find the tile layer
        leafletMap.eachLayer((layer: any) => {
            if (layer instanceof L.TileLayer) {
                tileLayer = layer;
                
                // Listen for tile events
                layer.on('tileloadstart', (e: any) => {
                    if ($cheatSettings.showTileDebug && e.coords) {
                        const tileKey = `${e.coords.z}/${e.coords.x}/${e.coords.y}`;
                        cheatActions.addActiveTile(tileKey);
                    }
                });

                layer.on('tileload', (e: any) => {
                    // Tile loaded successfully - could be used for additional info
                });

                layer.on('tileerror', (e: any) => {
                    if ($cheatSettings.showTileDebug && e.coords) {
                        const tileKey = `${e.coords.z}/${e.coords.x}/${e.coords.y}`;
                        cheatActions.removeActiveTile(tileKey);
                    }
                });
            }
        });

        // Listen for map events that change tiles
        leafletMap.on('moveend zoomend', () => {
            if ($cheatSettings.showTileDebug) {
                updateActiveTiles();
            }
        });
    }

    function updateActiveTiles() {
        if (!leafletMap || !tileLayer) return;

        const bounds = leafletMap.getBounds();
        const zoom = leafletMap.getZoom();
        const activeTileSet = new Set<string>();

        // Calculate visible tiles based on current bounds and zoom
        const northWest = leafletMap.project(bounds.getNorthWest(), zoom);
        const southEast = leafletMap.project(bounds.getSouthEast(), zoom);
        
        const tileSize = 256; // Standard tile size
        const minTileX = Math.floor(northWest.x / tileSize);
        const maxTileX = Math.floor(southEast.x / tileSize);
        const minTileY = Math.floor(northWest.y / tileSize);
        const maxTileY = Math.floor(southEast.y / tileSize);

        // Add all visible tiles to the set
        for (let x = minTileX; x <= maxTileX; x++) {
            for (let y = minTileY; y <= maxTileY; y++) {
                const tileKey = `${zoom}/${x}/${y}`;
                activeTileSet.add(tileKey);
            }
        }

        cheatActions.setActiveTiles(activeTileSet);
    }

    // Reactive update when tile debug setting changes
    $: {
        if (leafletMap && $cheatSettings.showTileDebug) {
            updateActiveTiles();
        } else if (!$cheatSettings.showTileDebug) {
            cheatActions.clearActiveTiles();
        }
    }

    onMount(() => {
        initMap();
    });

    onDestroy(() => {
        if (animationInterval) {
            clearInterval(animationInterval);
        }
        
        if (leafletMap) {
            leafletMap.remove();
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
</div>

<!-- Tile Debug Display -->
{#if $cheatSettings.showTileDebug}
    <div class="tile-debug-container">
        <div class="card bg-base-200 shadow-sm">
            <div class="card-body p-4">
                <h4 class="card-title text-sm text-base-content/70">
                    🗺️ Active Map Tiles ({$activeTiles.size})
                </h4>
                <div class="tile-list">
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

    :global(.custom-employee-marker) {
        background: transparent !important;
        border: none !important;
    }

    :global(.employee-marker) {
        background: white;
        border: 2px solid #3b82f6;
        border-radius: 8px;
        padding: 4px 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 100px;
        transition: all 0.3s ease;
        cursor: pointer;
    }

    :global(.employee-marker:hover) {
        transform: scale(1.05);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }

    :global(.employee-marker.animated) {
        border-color: #10b981;
        background: #f0fdf4;
    }

    :global(.employee-marker.idle) {
        border-color: #6b7280;
        background: #f9fafb;
    }

    :global(.employee-marker.selected) {
        border-color: #dc2626;
        background: #fef2f2;
        border-width: 3px;
        transform: scale(1.1);
    }

    :global(.marker-content) {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
    }

    :global(.employee-name) {
        font-weight: 600;
        color: #1f2937;
        white-space: nowrap;
    }

    :global(.progress-bar) {
        width: 80px;
        height: 4px;
        background: #e5e7eb;
        border-radius: 2px;
        overflow: hidden;
    }

    :global(.progress-fill) {
        height: 100%;
        background: #10b981;
        transition: width 0.5s ease;
        border-radius: 2px;
    }

    :global(.eta) {
        font-size: 10px;
        color: #059669;
        font-weight: 600;
        margin-top: 2px;
    }

    .tile-debug-container {
        margin-top: 16px;
    }

    .tile-list {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        max-height: 120px;
        overflow-y: auto;
    }

    .tile-list::-webkit-scrollbar {
        width: 4px;
    }

    .tile-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .tile-list::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 2px;
    }
</style> 