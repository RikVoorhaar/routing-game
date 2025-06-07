<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Employee, Route, Address } from '$lib/types';
    import { MIN_ROUTE_REGEN_INTERVAL } from '$lib/types';

    export let employee: Employee;
    export let availableRoutes: Route[] = [];
    export let currentRoute: Route | null = null;
    export let gameStateId: string;

    const dispatch = createEventDispatcher<{
        generateRoutes: { employeeId: string };
        assignRoute: { employeeId: string; routeId: string };
    }>();

    let isGenerating = false;
    let isAssigning = false;
    let selectedRouteId = '';
    let error = '';

    // Parse employee location
    $: location = employee.location ? JSON.parse(employee.location as string) as Address : null;
    $: upgradeState = JSON.parse(employee.upgradeState as string) as { vehicleType: string; capacity: number };

    // Check if routes can be regenerated
    $: canRegenerateRoutes = !employee.timeRoutesGenerated || 
        (Date.now() - new Date(employee.timeRoutesGenerated).getTime()) >= MIN_ROUTE_REGEN_INTERVAL;

    // Calculate time until routes can be regenerated
    $: timeUntilRegen = employee.timeRoutesGenerated ? 
        Math.max(0, MIN_ROUTE_REGEN_INTERVAL - (Date.now() - new Date(employee.timeRoutesGenerated).getTime())) : 0;
    $: regenWaitMinutes = Math.ceil(timeUntilRegen / 1000 / 60);

    // Route progress calculation
    $: routeProgress = currentRoute && currentRoute.startTime ? 
        calculateRouteProgress(currentRoute) : null;

    function calculateRouteProgress(route: Route) {
        if (!route.startTime) return null;
        
        const startTime = new Date(route.startTime).getTime();
        const currentTime = Date.now();
        const totalDuration = route.lengthTime * 1000; // Convert to milliseconds
        const elapsed = currentTime - startTime;
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        const remainingTime = Math.max(0, totalDuration - elapsed);
        
        return {
            progress,
            remainingTimeMs: remainingTime,
            isComplete: progress >= 100
        };
    }

    function formatTime(milliseconds: number): string {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    function formatMoney(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    function formatAddress(address: Address): string {
        const parts = [];
        if (address.street) parts.push(address.street);
        if (address.house_number) parts.push(address.house_number);
        if (address.city) parts.push(address.city);
        return parts.join(' ') || `${address.lat.toFixed(4)}, ${address.lon.toFixed(4)}`;
    }

    async function handleGenerateRoutes() {
        isGenerating = true;
        error = '';
        
        try {
            const response = await fetch('/api/employees', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generateRoutes',
                    employeeId: employee.id,
                    gameStateId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate routes');
            }

            dispatch('generateRoutes', { employeeId: employee.id });
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to generate routes';
        } finally {
            isGenerating = false;
        }
    }

    async function handleAssignRoute() {
        if (!selectedRouteId) return;
        
        isAssigning = true;
        error = '';
        
        try {
            const response = await fetch('/api/employees', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'assignRoute',
                    employeeId: employee.id,
                    gameStateId,
                    routeId: selectedRouteId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to assign route');
            }

            dispatch('assignRoute', { employeeId: employee.id, routeId: selectedRouteId });
            selectedRouteId = '';
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to assign route';
        } finally {
            isAssigning = false;
        }
    }
</script>

<div class="card bg-base-100 shadow-lg border">
    <div class="card-body p-4">
        <div class="flex justify-between items-start mb-3">
            <h3 class="card-title text-lg font-bold text-primary">{employee.name}</h3>
            <div class="badge badge-secondary">{upgradeState.vehicleType}</div>
        </div>

        {#if error}
            <div class="alert alert-error alert-sm mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-xs">{error}</span>
            </div>
        {/if}

        <!-- Current Status -->
        {#if currentRoute}
            <!-- On Route -->
            <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-medium">Route Progress</span>
                    <span class="text-xs text-base-content/70">
                        {routeProgress ? Math.round(routeProgress.progress) : 0}%
                    </span>
                </div>
                
                <progress 
                    class="progress progress-primary w-full" 
                    value={routeProgress?.progress || 0} 
                    max="100"
                ></progress>
                
                {#if routeProgress && !routeProgress.isComplete}
                    <div class="text-xs text-base-content/70 mt-1">
                        ETA: {formatTime(routeProgress.remainingTimeMs)}
                    </div>
                {/if}

                <!-- Route Details -->
                <div class="mt-3 space-y-1 text-xs">
                    <div><strong>From:</strong> {formatAddress(JSON.parse(currentRoute.startLocation as string))}</div>
                    <div><strong>To:</strong> {formatAddress(JSON.parse(currentRoute.endLocation as string))}</div>
                    <div class="flex justify-between">
                        <span><strong>Goods:</strong> {currentRoute.goodsType}</span>
                        <span><strong>Reward:</strong> {formatMoney(currentRoute.reward)}</span>
                    </div>
                </div>
            </div>
        {:else}
            <!-- Not on Route -->
            <div class="mb-4">
                <div class="text-sm mb-2">
                    <strong>Current Location:</strong>
                    {#if location}
                        <div class="text-xs text-base-content/70">{formatAddress(location)}</div>
                    {:else}
                        <div class="text-xs text-error">No location set</div>
                    {/if}
                </div>

                {#if availableRoutes.length > 0}
                    <!-- Route Selection -->
                    <div class="form-control">
                        <label class="label py-1">
                            <span class="label-text text-xs">Select Route</span>
                        </label>
                        <div class="flex gap-2">
                            <select 
                                class="select select-bordered select-sm flex-1"
                                bind:value={selectedRouteId}
                                disabled={isAssigning}
                            >
                                <option value="">Choose a route...</option>
                                {#each availableRoutes as route}
                                    <option value={route.id}>
                                        {route.goodsType} - {formatMoney(route.reward)} 
                                        ({Math.round(route.lengthTime / 60)}min)
                                    </option>
                                {/each}
                            </select>
                            <button 
                                class="btn btn-primary btn-sm"
                                on:click={handleAssignRoute}
                                disabled={!selectedRouteId || isAssigning}
                            >
                                {#if isAssigning}
                                    <span class="loading loading-spinner loading-xs"></span>
                                {:else}
                                    Go
                                {/if}
                            </button>
                        </div>
                    </div>
                {:else}
                    <!-- Generate Routes -->
                    <div class="text-center">
                        <button 
                            class="btn btn-outline btn-sm"
                            class:btn-disabled={!canRegenerateRoutes}
                            on:click={handleGenerateRoutes}
                            disabled={isGenerating || !canRegenerateRoutes}
                        >
                            {#if isGenerating}
                                <span class="loading loading-spinner loading-xs"></span>
                                Generating...
                            {:else if !canRegenerateRoutes}
                                Routes in {regenWaitMinutes}min
                            {:else}
                                Generate Routes
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        {/if}

        <!-- Employee Stats -->
        <div class="stats stats-horizontal shadow bg-base-200">
            <div class="stat py-2 px-3">
                <div class="stat-title text-xs">Speed</div>
                <div class="stat-value text-sm">{employee.speedMultiplier}x</div>
            </div>
            <div class="stat py-2 px-3">
                <div class="stat-title text-xs">Capacity</div>
                <div class="stat-value text-sm">{upgradeState.capacity}</div>
            </div>
        </div>
    </div>
</div> 