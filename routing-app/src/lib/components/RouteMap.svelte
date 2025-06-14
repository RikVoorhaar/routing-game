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
    import { interpolateLocationAtTime } from '$lib/routing-client';
    import type { Employee, Route, PathPoint, Address, Coordinate } from '$lib/types';
    import { DEFAULT_EMPLOYEE_LOCATION } from '$lib/types';

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

    // Animation state
    let animationInterval: NodeJS.Timeout | null = null;

    // Reactive updates
    $: {
        if (leafletMap) {
            console.log('[RouteMap] Reactive update triggered');
            console.log('[RouteMap] Employees:', $employees.length);
            console.log('[RouteMap] Routes by employee:', Object.keys($routesByEmployee).length);
            console.log('[RouteMap] Current game state:', $currentGameState?.id);
            updateMap();
        }
    }

    // Reactive updates for selected employee
    $: {
        if (leafletMap && $selectedEmployee) {
            console.log('[RouteMap] Selected employee changed:', $selectedEmployee);
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

            console.log('[RouteMap] Creating Leaflet map');
            
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
                maxZoom: 19
            }).addTo(leafletMap);

            console.log('[RouteMap] Map created successfully');
            
            // Initial map update
            updateMap();
            
            // Start animation loop
            startAnimation();
            
        } catch (error) {
            console.error('[RouteMap] Failed to initialize map:', error);
        }
    }

    function updateMap() {
        if (!leafletMap || !L) return;
        
        console.log('[RouteMap] Updating map with employee data');
        
        // Clear existing markers and polylines
        Object.values(employeeMarkers).forEach((marker: any) => {
            leafletMap.removeLayer(marker);
        });
        Object.values(routePolylines).forEach((polyline: any) => {
            leafletMap.removeLayer(polyline);
        });
        clearAvailableRoutes();
        employeeMarkers = {};
        routePolylines = {};

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
                        console.log('[RouteMap] Route clicked:', currentRoute.id);
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
            
            console.log(`[RouteMap] Processing employee ${employee.name}:`, {
                hasRoutes: !!employeeRoutes,
                hasCurrentRoute: !!currentRoute,
                currentRouteId: currentRoute?.id
            });
            
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
                
                // Calculate progress percentage
                progress = Math.min((elapsedSeconds / currentRoute.lengthTime) * 100, 100);
                
                // Calculate ETA
                const remainingSeconds = Math.max(0, currentRoute.lengthTime - elapsedSeconds);
                eta = formatTimeRemaining(remainingSeconds);
                
                // Use interpolateLocationAtTime to get current position
                const interpolatedPosition = interpolateLocationAtTime(routeData, elapsedSeconds);
                position = interpolatedPosition || { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                isAnimated = true;
                
                console.log(`[RouteMap] Employee ${employee.name} is traveling:`, {
                    progress: progress,
                    position: position,
                    elapsedSeconds: elapsedSeconds,
                    routeLength: currentRoute.lengthTime,
                    eta: eta
                });
            } else {
                // Employee is idle - use their location or default
                if (employee.location) {
                    try {
                        const locationData = JSON.parse(employee.location) as Address;
                        position = { lat: locationData.lat, lon: locationData.lon };
                    } catch (e) {
                        console.warn(`[RouteMap] Invalid location data for employee ${employee.name}:`, e);
                        position = { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                    }
                } else {
                    position = { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                }
                
                console.log(`[RouteMap] Employee ${employee.name} is idle at:`, position);
            }

            // Create custom marker with click handler
            const markerIcon = L.divIcon({
                html: createMarkerHTML(employee.name, isAnimated, progress, eta, employee.id === $selectedEmployee),
                className: 'custom-employee-marker',
                iconSize: [140, isAnimated ? 80 : 50],
                iconAnchor: [70, isAnimated ? 40 : 25]
            });

            const marker = L.marker([position.lat, position.lon], {
                icon: markerIcon,
                title: `${employee.name}${isAnimated ? ` (${Math.round(progress)}% complete, ETA: ${eta})` : ' (idle)'}`
            }).addTo(leafletMap);

            // Add click handler to marker
            marker.on('click', () => {
                console.log('[RouteMap] Employee marker clicked:', employee.name);
                selectEmployee(employee.id);
            });

            employeeMarkers[employee.id] = marker;
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
            console.log('[RouteMap] No employees found, adding default marker');
            const defaultMarker = L.marker([DEFAULT_EMPLOYEE_LOCATION.lat, DEFAULT_EMPLOYEE_LOCATION.lon], {
                title: 'Default Location (Utrecht)'
            }).addTo(leafletMap);
            
            employeeMarkers['default'] = defaultMarker;
        }

        console.log('[RouteMap] Map updated with', Object.keys(employeeMarkers).length, 'markers');
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

    function formatTimeRemaining(seconds: number): string {
        if (seconds <= 0) return 'Arriving';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${remainingSeconds}s`;
        }
    }

    function parseRouteData(routeDataString: string): PathPoint[] {
        try {
            return JSON.parse(routeDataString) as PathPoint[];
        } catch (e) {
            console.error('[RouteMap] Failed to parse route data:', e);
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

        console.log('[RouteMap] Handling employee selection:', {
            employeeId,
            hasCurrentRoute: !!currentRoute,
            availableRoutesCount: availableRoutes.length
        });

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
                    console.log('[RouteMap] Available route clicked:', route.id);
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
                const startLocation = JSON.parse(route.startLocation) as Address;
                const endLocation = JSON.parse(route.endLocation) as Address;
                const rewardFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(route.reward);
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
            leafletMap.removeLayer(polyline);
        });
        availableRoutePolylines = [];
    }

    function getEmployeePosition(employee: Employee): Coordinate {
        if (employee.location) {
            try {
                const locationData = JSON.parse(employee.location) as Address;
                return { lat: locationData.lat, lon: locationData.lon };
            } catch (e) {
                console.warn(`[RouteMap] Invalid location data for employee ${employee.name}:`, e);
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

    onMount(() => {
        console.log('[RouteMap] Component mounted');
        initMap();
    });

    onDestroy(() => {
        console.log('[RouteMap] Component destroyed');
        
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
</style> 