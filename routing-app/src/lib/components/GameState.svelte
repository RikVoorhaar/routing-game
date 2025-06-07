<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { GameState, Employee, Route } from '$lib/types';
    import { computeEmployeeCosts } from '$lib/types';
    import EmployeeCard from './EmployeeCard.svelte';
    import { faker } from '@faker-js/faker';

    export let gameState: GameState;
    export let employees: Employee[] = [];

    let showHireModal = false;
    let newEmployeeName = '';
    let isHiring = false;
    let hireError = '';
    let employeeRoutes: Record<string, Route[]> = {};
    let currentRoutes: Record<string, Route | null> = {};
    let refreshInterval: any;

    // Reactive calculations
    $: hiringCost = computeEmployeeCosts(employees.length);
    $: canAffordEmployee = gameState.money >= hiringCost;

    onMount(() => {
        // Set up periodic refresh for route progress
        refreshInterval = setInterval(() => {
            // Force re-render of employee cards to update progress
            employees = [...employees];
            loadEmployeeRoutes();
        }, 1000);

        loadEmployeeRoutes();
    });

    onDestroy(() => {
        if (refreshInterval) {
            clearInterval(refreshInterval);
        }
    });

    async function loadEmployeeRoutes() {
        try {
            // Load routes for all employees
            for (const employee of employees) {
                // Get available routes
                const availableRouteIds = JSON.parse(employee.availableRoutes as string) as string[];
                if (availableRouteIds.length > 0) {
                    const routesResponse = await fetch(`/api/routes?ids=${availableRouteIds.join(',')}`);
                    if (routesResponse.ok) {
                        const routes = await routesResponse.json();
                        employeeRoutes[employee.id] = routes;
                    }
                }

                // Get current route if assigned
                if (employee.currentRoute) {
                    const routeResponse = await fetch(`/api/routes/${employee.currentRoute}`);
                    if (routeResponse.ok) {
                        const route = await routeResponse.json();
                        currentRoutes[employee.id] = route;
                    }
                }
            }
            
            // Trigger reactivity
            employeeRoutes = { ...employeeRoutes };
            currentRoutes = { ...currentRoutes };
        } catch (error) {
            console.error('Error loading employee routes:', error);
        }
    }

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
                    gameStateId: gameState.id,
                    employeeName: newEmployeeName
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to hire employee');
            }

            const result = await response.json();
            
            // Update local state
            employees = [...employees, result.employee];
            gameState.money = result.newBalance;
            
            handleHireModalClose();
        } catch (error) {
            hireError = error instanceof Error ? error.message : 'Failed to hire employee';
        } finally {
            isHiring = false;
        }
    }

    async function handleEmployeeRouteGenerated(event: CustomEvent<{ employeeId: string }>) {
        // Reload employee data and routes
        const { employeeId } = event.detail;
        
        try {
            // Reload the employee data to get updated route information
            const response = await fetch(`/api/employees/${employeeId}`);
            if (response.ok) {
                const updatedEmployee = await response.json();
                employees = employees.map(emp => 
                    emp.id === employeeId ? updatedEmployee : emp
                );
            }
            
            await loadEmployeeRoutes();
        } catch (error) {
            console.error('Error refreshing employee data:', error);
        }
    }

    async function handleEmployeeRouteAssigned(event: CustomEvent<{ employeeId: string; routeId: string }>) {
        // Reload employee data and routes
        const { employeeId } = event.detail;
        
        try {
            // Reload the employee data to get updated route information
            const response = await fetch(`/api/employees/${employeeId}`);
            if (response.ok) {
                const updatedEmployee = await response.json();
                employees = employees.map(emp => 
                    emp.id === employeeId ? updatedEmployee : emp
                );
            }
            
            await loadEmployeeRoutes();
        } catch (error) {
            console.error('Error refreshing employee data:', error);
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
</script>

<div class="min-h-screen bg-base-200">
    <!-- Header -->
    <div class="navbar bg-base-100 shadow-lg">
        <div class="flex-1">
            <a href="/character-select" class="btn btn-ghost text-xl">
                ← {gameState.name}
            </a>
        </div>
        <div class="flex-none">
            <div class="stats stats-horizontal shadow">
                <div class="stat">
                    <div class="stat-title">Money</div>
                    <div class="stat-value text-success">{formatMoney(gameState.money)}</div>
                </div>
                <div class="stat">
                    <div class="stat-title">Route Level</div>
                    <div class="stat-value text-info">{gameState.routeLevel}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="container mx-auto px-4 py-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Panel - Employees -->
            <div class="lg:col-span-2">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold">Employees ({employees.length})</h2>
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

                {#if employees.length === 0}
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
                    <div class="space-y-4">
                        {#each employees as employee (employee.id)}
                            <EmployeeCard 
                                {employee}
                                availableRoutes={employeeRoutes[employee.id] || []}
                                currentRoute={currentRoutes[employee.id] || null}
                                gameStateId={gameState.id}
                                on:generateRoutes={handleEmployeeRouteGenerated}
                                on:assignRoute={handleEmployeeRouteAssigned}
                            />
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Right Panel - Map -->
            <div class="lg:col-span-1">
                <div class="card bg-base-100 shadow-lg h-[600px]">
                    <div class="card-body">
                        <h3 class="card-title">Map</h3>
                        <div class="flex-1 flex items-center justify-center bg-base-200 rounded-lg">
                            <div class="text-center">
                                <svg class="w-16 h-16 mx-auto text-base-content/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z">
                                    </path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z">
                                    </path>
                                </svg>
                                <p class="text-base-content/50">Map coming soon...</p>
                            </div>
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
                                Current balance: {formatMoney(gameState.money)}
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
                <label class="label">
                    <span class="label-text">Employee Name</span>
                </label>
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