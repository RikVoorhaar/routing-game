<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { computeEmployeeCosts } from '$lib/types';
    import { formatMoney } from '$lib/formatting';
    import EmployeeCard from './EmployeeCard.svelte';
    import ErrorOverlay from './ErrorOverlay.svelte';
    import Cheats from './Cheats.svelte';
    import RouteMap from './RouteMap.svelte';
    import JobCard from './JobCard.svelte';
    import { faker } from '@faker-js/faker';
    import { addError } from '$lib/stores/errors';
    import { 
        gameDataActions, 
        gameDataAPI,
        currentGameState, 
        employees,
        currentUser,
        routesByEmployee,
        getEmployeeRoutes 
    } from '$lib/stores/gameData';
    import type { GameState, Employee } from '$lib/types';

    // Props for initial data - we'll move this to stores
    export let gameState: GameState;
    export let initialEmployees: Employee[] = [];
    export let cheatsEnabled: boolean = false;

    let showHireModal = false;
    let newEmployeeName = '';
    let isHiring = false;
    let hireError = '';
    let refreshInterval: any;

    // Initialize stores with props data
    onMount(() => {
        gameDataActions.init({
            gameState,
            employees: initialEmployees,
            cheatsEnabled,
            user: {
                id: 'current-user', // We'll need to get this from session
                cheatsEnabled
            }
        });

        // Load routes for all employees
        gameDataAPI.loadAllEmployeeRoutes();

        // Set up periodic refresh for route progress
        refreshInterval = setInterval(() => {
            // Trigger route progress updates
            gameDataAPI.loadAllEmployeeRoutes();
        }, 1000);
    });

    onDestroy(() => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    // Reactive calculations using stores
    $: hiringCost = computeEmployeeCosts($employees.length);
    $: canAffordEmployee = $currentGameState ? $currentGameState.money >= hiringCost : false;

    function handleHireModalOpen() {
        showHireModal = true;
        newEmployeeName = generateRandomEmployeeName();
        hireError = '';
    }

    function handleHireModalClose() {
        showHireModal = false;
        newEmployeeName = '';
        hireError = '';
    }

    function generateRandomEmployeeName(): string {
        return faker.person.fullName();
    }

    async function handleHireEmployee() {
        isHiring = true;
        hireError = '';

        try {
            const response = await fetch('/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameStateId: $currentGameState!.id,
                    employeeName: newEmployeeName
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to hire employee');
            }

            const result = await response.json();
            
            // Update stores
            gameDataActions.addEmployee(result.employee);
            gameDataActions.updateMoney(result.newBalance);
            
            handleHireModalClose();
        } catch (error) {
            hireError = error instanceof Error ? error.message : 'Failed to hire employee';
            addError(`Failed to hire employee: ${hireError}`, 'error');
        } finally {
            isHiring = false;
        }
    }

    async function handleEmployeeRouteGenerated(event: CustomEvent<{ employeeId: string }>) {
        const { employeeId } = event.detail;
        
        try {
            // Refresh employee data and routes
            await gameDataAPI.refreshEmployee(employeeId);
            await gameDataAPI.loadAllEmployeeRoutes();
        } catch (error) {
            console.error('Error refreshing employee data:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to refresh employee data';
            addError(`Failed to refresh employee: ${errorMessage}`, 'error');
        }
    }

    async function handleEmployeeRouteAssigned(event: CustomEvent<{ employeeId: string; routeId: string }>) {
        const { employeeId } = event.detail;
        
        try {
            // Refresh employee data and routes
            await gameDataAPI.refreshEmployee(employeeId);
            await gameDataAPI.loadAllEmployeeRoutes();
        } catch (error) {
            console.error('Error refreshing employee data:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to refresh employee data';
            addError(`Failed to refresh employee: ${errorMessage}`, 'error');
        }
    }

    async function handleEmployeeRouteCompleted(event: CustomEvent<{ employeeId: string; reward: number; newBalance: number }>) {
        const { employeeId, newBalance } = event.detail;
        
        try {
            // Update game state money and refresh employee data
            gameDataActions.updateMoney(newBalance);
            
            // Clear the current route for this employee
            gameDataActions.clearCurrentRoute(employeeId);
            
            // Refresh employee data from server
            await gameDataAPI.refreshEmployee(employeeId);
            
            console.log(`🎉 Route completed! Employee ${employeeId} earned ${event.detail.reward}`);
            addError(`🎉 Route completed! Earned ${formatMoney(event.detail.reward)}`, 'info', true, 3000);
        } catch (error) {
            console.error('Error refreshing data after route completion:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to refresh data after route completion';
            addError(`Failed to update after route completion: ${errorMessage}`, 'error');
        }
    }

    async function handleCheatMoneyUpdated(event: CustomEvent<{ newBalance: number }>) {
        // Update game state money from cheat
        gameState.money = event.detail.newBalance;
        gameState = { ...gameState }; // Trigger reactivity
    }
</script>

<div class="min-h-screen bg-base-200">
    <!-- Header -->
    <div class="navbar bg-base-100 shadow-lg">
        <div class="flex-1">
            <a href="/character-select" class="btn btn-ghost text-xl">
                ← {$currentGameState?.name || 'Game'}
            </a>
        </div>
        <div class="flex-none">
            <div class="stats stats-horizontal shadow">
                <div class="stat">
                    <div class="stat-title">Money</div>
                    <div class="stat-value text-success">{formatMoney($currentGameState?.money || 0)}</div>
                </div>
                <div class="stat">
                    <div class="stat-title">Route Level</div>
                    <div class="stat-value text-info">{$currentGameState?.routeLevel || 0}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="container mx-auto px-4 py-6">
        <!-- Cheats Component (only shows when cheats are enabled) -->
        <Cheats />

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Panel - Jobs and Employees -->
            <div class="lg:col-span-1 space-y-6">
                <!-- Selected Job Card -->
                <JobCard />
                
                <!-- Employees Section -->
                <div>
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-2xl font-bold">Employees ({$employees.length})</h2>
                    <button 
                        class="btn btn-primary"
                        class:btn-disabled={!canAffordEmployee}
                        on:click={handleHireModalOpen}
                        disabled={!canAffordEmployee}
                    >
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                        </svg>
                        Hire Employee
                        {#if hiringCost > 0}
                            ({formatMoney(hiringCost)})
                        {:else}
                            (Free!)
                        {/if}
                    </button>
                </div>

                {#if $employees.length === 0}
                    <div class="card bg-base-100 shadow-lg">
                        <div class="card-body text-center py-16">
                            <div class="mb-4">
                                <svg class="w-24 h-24 mx-auto text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                                    </path>
                                </svg>
                            </div>
                            <h3 class="text-xl font-bold mb-2">No Employees Yet</h3>
                            <p class="text-base-content/70 mb-6">Hire your first employee to start running routes and earning money!</p>
                            <button 
                                class="btn btn-primary btn-lg"
                                on:click={handleHireModalOpen}
                            >
                                Hire Your First Employee (Free!)
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="space-y-4 overflow-visible">
                        {#each $employees as employee (employee.id)}
                            {@const employeeRoutes = $routesByEmployee[employee.id] || { available: [], current: null }}
                            <div class="overflow-visible">
                                <EmployeeCard 
                                    {employee}
                                    availableRoutes={employeeRoutes.available}
                                    currentRoute={employeeRoutes.current}
                                    gameStateId={$currentGameState?.id || ''}
                                    on:generateRoutes={handleEmployeeRouteGenerated}
                                    on:assignRoute={handleEmployeeRouteAssigned}
                                    on:routeCompleted={handleEmployeeRouteCompleted}
                                />
                            </div>
                        {/each}
                    </div>
                {/if}
                </div>
            </div>

            <!-- Right Panel - Map -->
            <div class="lg:col-span-2">
                <div class="card bg-base-100 shadow-lg h-[700px]">
                    <div class="card-body p-2">
                        <h3 class="card-title px-4 py-2">Route Map</h3>
                        <div class="flex-1">
                            <RouteMap />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Hire Employee Modal -->
{#if showHireModal}
    <div class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Hire New Employee</h3>
            
            <div class="mb-4">
                <div class="alert alert-info">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div>
                        <div class="font-bold">
                            Cost: {formatMoney(hiringCost)}
                        </div>
                        <div class="text-sm">
                            {#if hiringCost === 0}
                                Your first employee is free!
                            {:else}
                                Current balance: {formatMoney($currentGameState?.money || 0)}
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            {#if hireError}
                <div class="alert alert-error mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{hireError}</span>
                </div>
            {/if}
            
            <div class="form-control mb-6">
                <div class="label">
                    <span class="label-text">Employee Name</span>
                </div>
                <div class="p-3 bg-base-200 rounded-lg border-2 border-dashed border-base-300">
                    <div class="flex items-center gap-2">
                        <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span class="text-lg font-medium">{newEmployeeName}</span>
                    </div>
                    <p class="text-xs text-base-content/70 mt-1">Name automatically generated</p>
                </div>
            </div>
            
            <div class="modal-action">
                <button 
                    class="btn btn-ghost"
                    on:click={handleHireModalClose}
                    disabled={isHiring}
                >
                    Cancel
                </button>
                <button 
                    class="btn btn-primary"
                    on:click={handleHireEmployee}
                    disabled={isHiring || !canAffordEmployee}
                >
                    {#if isHiring}
                        <span class="loading loading-spinner loading-xs"></span>
                        Hiring...
                    {:else}
                        Hire Employee
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if} 

<!-- Global Error Overlay -->
<ErrorOverlay /> 