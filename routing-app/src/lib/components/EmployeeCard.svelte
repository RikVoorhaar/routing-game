<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { onDestroy } from 'svelte';
    import { selectedEmployee, selectEmployee } from '$lib/stores/selectedEmployee';
    import type { Employee, Route, Address } from '$lib/types';
    import { MIN_ROUTE_REGEN_INTERVAL } from '$lib/types';
    import { addError } from '$lib/stores/errors';
    import { selectedRoute, clearSelection } from '$lib/stores/selectedRoute';
    import { formatMoney, formatAddress, formatTimeFromMs } from '$lib/formatting';
    import RouteCard from './RouteCard.svelte';

    export let employee: Employee;
    export let availableRoutes: Route[] = [];
    export let currentRoute: Route | null = null;
    export let gameStateId: string;

    const dispatch = createEventDispatcher<{
        generateRoutes: { employeeId: string };
        assignRoute: { employeeId: string; routeId: string };
        routeCompleted: { employeeId: string; reward: number; newBalance: number };
    }>();

    let isGenerating = false;
    let isAssigning = false;
    let isCompletingRoute = false;
    let previouslyCompleted = false; // Track if we've already processed completion
    let lastCompletedRouteId = ''; // Track which route was last completed
    let routeCompletionState: 'pending' | 'processing' | 'completed' | 'error' = 'pending';
    let completionTimeout: any = null;

    // Cleanup timeout on component destroy
    onDestroy(() => {
        if (completionTimeout) {
            clearTimeout(completionTimeout);
        }
    });

    // Check if the currently selected route belongs to this employee
    $: selectedRouteIsForThisEmployee = $selectedRoute && availableRoutes.some(route => route.id === $selectedRoute);

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

    // Handle route completion with debouncing and state machine
    $: {
        if (currentRoute && routeProgress?.isComplete && 
            routeCompletionState === 'pending' && 
            lastCompletedRouteId !== currentRoute.id) {
            
            // Set state to processing immediately to prevent multiple triggers
            routeCompletionState = 'processing';
            
            // Clear any existing timeout
            if (completionTimeout) {
                clearTimeout(completionTimeout);
            }
            
            // Debounce the completion call
            completionTimeout = setTimeout(() => {
                handleRouteCompletion();
            }, 100); // 100ms debounce
        }
    }

    // Reset completion state when route changes or is cleared
    $: if (!currentRoute) {
        routeCompletionState = 'pending';
        lastCompletedRouteId = '';
        if (completionTimeout) {
            clearTimeout(completionTimeout);
            completionTimeout = null;
        }
    } else if (currentRoute && lastCompletedRouteId !== currentRoute.id) {
        // New route started, reset completion state
        routeCompletionState = 'pending';
        if (completionTimeout) {
            clearTimeout(completionTimeout);
            completionTimeout = null;
        }
    }

    // Clear route selection when this employee's context changes
    $: {
        if (selectedRouteIsForThisEmployee) {
            // Clear selection if this employee goes on a route
            if (currentRoute) {
                clearSelection();
            }
            // Clear selection if the selected route is no longer available for this employee
            else if (availableRoutes.length === 0) {
                clearSelection();
            }
        }
    }

    // Is this employee selected?
    $: isSelected = $selectedEmployee === employee.id;

    // Tailwind class string for the card
    $: cardClass = [
        'card bg-base-200 shadow-lg border transition-all duration-150 cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-primary/70',
        'hover:shadow-xl hover:border-primary/60',
        isSelected ? 'border-4 border-primary ring-2 ring-primary/30 scale-105' : '',
        'w-full',
        'overflow-visible'
    ].join(' ');

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

    async function handleGenerateRoutes() {
        isGenerating = true;
        
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
            const errorMessage = err instanceof Error ? err.message : 'Failed to generate routes';
            addError(`Route generation failed: ${errorMessage}`, 'error');
        } finally {
            isGenerating = false;
        }
    }

    async function handleAssignRoute() {
        if (!$selectedRoute || !selectedRouteIsForThisEmployee) return;
        
        isAssigning = true;
        
        try {
            const response = await fetch('/api/employees', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'assignRoute',
                    employeeId: employee.id,
                    gameStateId,
                    routeId: $selectedRoute
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to assign route');
            }

            dispatch('assignRoute', { employeeId: employee.id, routeId: $selectedRoute });
            clearSelection(); // Clear selection after successful assignment
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to assign route';
            addError(`Route assignment failed: ${errorMessage}`, 'error');
        } finally {
            isAssigning = false;
        }
    }

    async function handleRouteCompletion() {
        if (!currentRoute || routeCompletionState !== 'processing') {
            console.log('Route completion skipped:', { hasRoute: !!currentRoute, state: routeCompletionState });
            return;
        }
        
        // Additional safety check
        if (lastCompletedRouteId === currentRoute.id) {
            console.log('Route already completed:', currentRoute.id);
            routeCompletionState = 'completed';
            return;
        }
        
        try {
            console.log('Starting route completion for:', currentRoute.id);
            
            const response = await fetch('/api/employees', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'completeRoute',
                    employeeId: employee.id,
                    gameStateId,
                    routeId: currentRoute.id
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to complete route');
            }

            const result = await response.json();
            console.log(`Route completed successfully! Earned ${result.reward}. New balance: ${result.newBalance}`);
            
            // Mark as completed and track the route ID
            routeCompletionState = 'completed';
            lastCompletedRouteId = currentRoute.id;
            
            // Dispatch event to refresh employee data
            dispatch('routeCompleted', { employeeId: employee.id, reward: result.reward, newBalance: result.newBalance });
        } catch (err) {
            console.error('Error completing route:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to complete route';
            
            // Use error store instead of local error state
            addError(`Route completion failed: ${errorMessage}`, 'error');
            
            // Set error state but don't reset to pending - let user handle manually
            routeCompletionState = 'error';
        }
    }
</script>

<button
  type="button"
  class={cardClass}
  on:click={() => selectEmployee(employee.id)}
  on:keydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      selectEmployee(employee.id);
    }
  }}
>
    <div class="card-body p-6">
        <div class="flex justify-between items-start mb-3">
            <h3 class="card-title text-lg font-bold text-primary">{employee.name}</h3>
            <div class="badge badge-secondary">{upgradeState.vehicleType}</div>
        </div>

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
                        ETA: {formatTimeFromMs(routeProgress.remainingTimeMs)}
                    </div>
                {:else if routeProgress && routeProgress.isComplete}
                    <div class="text-xs text-success mt-1 font-medium">
                        {#if routeCompletionState === 'processing'}
                            <span class="loading loading-spinner loading-xs"></span>
                            Processing completion...
                        {:else if routeCompletionState === 'completed'}
                            ✅ Route Completed!
                        {:else if routeCompletionState === 'error'}
                            ❌ Completion failed - check errors
                        {:else}
                            ✅ Route Completed!
                        {/if}
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
                        <div class="label py-1">
                            <span class="label-text text-xs">Available Routes</span>
                        </div>
                        
                        <!-- Route Cards -->
                        <div class="space-y-2 max-h-120 overflow-visible p-2">
                            {#each availableRoutes as route (route.id)}
                                <RouteCard {route} />
                            {/each}
                        </div>
                        
                        <!-- Go Button -->
                        <div class="mt-3 pl-4">
                            <button 
                                class="btn btn-success btn-md max-w-lg"
                                on:click={handleAssignRoute}
                                disabled={!selectedRouteIsForThisEmployee || isAssigning}
                            >
                                {#if isAssigning}
                                    <span class="loading loading-spinner loading-xs"></span>
                                    Assigning...
                                {:else}
                                    <svg class="w-4 h-4 mr-2 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                    Start Route
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
</button> 