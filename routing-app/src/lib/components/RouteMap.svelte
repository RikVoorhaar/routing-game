<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { 
        employees, 
        routesByEmployee, 
        currentGameState 
    } from '$lib/stores/gameData';
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
        employeeMarkers = {};
        routePolylines = {};

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

            if (currentRoute && currentRoute.startTime) {
                // Employee is on a route - calculate animated position
                routeData = parseRouteData(currentRoute.routeData);
                
                // Calculate elapsed time since route started
                const startTime = new Date(currentRoute.startTime).getTime();
                const currentTime = Date.now();
                const elapsedSeconds = (currentTime - startTime) / 1000;
                
                // Calculate progress percentage
                progress = Math.min((elapsedSeconds / currentRoute.lengthTime) * 100, 100);
                
                // Use interpolateLocationAtTime to get current position
                const interpolatedPosition = interpolateLocationAtTime(routeData, elapsedSeconds);
                position = interpolatedPosition || { lat: DEFAULT_EMPLOYEE_LOCATION.lat, lon: DEFAULT_EMPLOYEE_LOCATION.lon };
                isAnimated = true;
                
                console.log(`[RouteMap] Employee ${employee.name} is traveling:`, {
                    progress: progress,
                    position: position,
                    elapsedSeconds: elapsedSeconds,
                    routeLength: currentRoute.lengthTime
                });

                // Add route polyline (thicker and solid)
                if (routeData.length > 0) {
                    const routeCoords = routeData.map(point => [point.coordinates.lat, point.coordinates.lon]);
                    const polyline = L.polyline(routeCoords, {
                        color: '#3b82f6',
                        weight: 5,
                        opacity: 0.8
                    }).addTo(leafletMap);
                    
                    routePolylines[employee.id] = polyline;
                }
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

            // Create custom marker
            const markerIcon = L.divIcon({
                html: createMarkerHTML(employee.name, isAnimated, progress),
                className: 'custom-employee-marker',
                iconSize: [120, isAnimated ? 60 : 40],
                iconAnchor: [60, isAnimated ? 30 : 20]
            });

            const marker = L.marker([position.lat, position.lon], {
                icon: markerIcon,
                title: `${employee.name}${isAnimated ? ` (${Math.round(progress)}% complete)` : ' (idle)'}`
            }).addTo(leafletMap);

            employeeMarkers[employee.id] = marker;
        });

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

    function createMarkerHTML(employeeName: string, isAnimated: boolean, progress: number): string {
        return `
            <div class="employee-marker ${isAnimated ? 'animated' : 'idle'}">
                <div class="marker-content">
                    <span class="employee-name">${employeeName}</span>
                    ${isAnimated ? `
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
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
    }

    :global(.employee-marker.animated) {
        border-color: #10b981;
        background: #f0fdf4;
    }

    :global(.employee-marker.idle) {
        border-color: #6b7280;
        background: #f9fafb;
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
</style> 