import { writable, derived, get } from 'svelte/store';
import type { GameState, Employee, Route } from '$lib/types';
import { addError } from './errors';
import { log } from '$lib/logger';

// User data store
export interface UserData {
    id: string;
    name?: string;
    email?: string;
    username?: string;
    cheatsEnabled: boolean;
}

export const currentUser = writable<UserData | null>(null);

// Game state store
export const currentGameState = writable<GameState | null>(null);

// Available game states store (for character selection)
export const availableGameStates = writable<GameState[]>([]);

// Employees store
export const employees = writable<Employee[]>([]);

// Routes store - organized by employee ID for efficient lookup
export const routesByEmployee = writable<Record<string, {
    available: Route[];
    current: Route | null;
}>>({});

// Derived store for all routes (flattened)
export const allRoutes = derived(routesByEmployee, ($routesByEmployee) => {
    const routes: Route[] = [];
    Object.values($routesByEmployee).forEach(employeeRoutes => {
        routes.push(...employeeRoutes.available);
        if (employeeRoutes.current) {
            routes.push(employeeRoutes.current);
        }
    });
    return routes;
});

// Derived store to check if cheats are enabled
export const cheatsEnabled = derived(currentUser, ($currentUser) => {
    return $currentUser?.cheatsEnabled || false;
});

// Store actions for updating data
export const gameDataActions = {
    // Initialize stores with page data
    init(data: {
        user?: UserData;
        gameState?: GameState;
        gameStates?: GameState[];
        employees?: Employee[];
        cheatsEnabled?: boolean;
    }) {
        if (data.user) {
            currentUser.set(data.user);
        } else if (data.cheatsEnabled !== undefined) {
            // If we only have cheatsEnabled, update the current user
            currentUser.update(user => user ? { ...user, cheatsEnabled: data.cheatsEnabled! } : null);
        }
        
        if (data.gameState) {
            currentGameState.set(data.gameState);
        }
        
        if (data.gameStates) {
            availableGameStates.set(data.gameStates);
        }
        
        if (data.employees) {
            employees.set(data.employees);
        }
    },

    // Update user data
    setUser(user: UserData) {
        currentUser.set(user);
    },

    // Update cheats enabled status
    setCheatsEnabled(enabled: boolean) {
        currentUser.update(user => user ? { ...user, cheatsEnabled: enabled } : null);
    },

    // Update game state
    setGameState(gameState: GameState) {
        currentGameState.set(gameState);
    },

    // Update available game states
    setAvailableGameStates(gameStates: GameState[]) {
        availableGameStates.set(gameStates);
    },

    // Add a new game state to available list
    addGameState(gameState: GameState) {
        availableGameStates.update(states => [...states, gameState]);
    },

    // Remove a game state from available list
    removeGameState(gameStateId: string) {
        availableGameStates.update(states => states.filter(state => state.id !== gameStateId));
    },

    // Update money in game state
    updateMoney(newAmount: number) {
        currentGameState.update(gameState => {
            if (!gameState) return null;
            return { ...gameState, money: newAmount };
        });
    },

    // Add money to current balance
    addMoney(amount: number) {
        currentGameState.update(gameState => {
            if (!gameState) return null;
            return { ...gameState, money: Math.max(0, gameState.money + amount) };
        });
    },

    // Update employees
    setEmployees(newEmployees: Employee[]) {
        employees.set(newEmployees);
        // Clear routes when employees change
        routesByEmployee.set({});
    },

    // Update a single employee
    updateEmployee(employeeId: string, updates: Partial<Employee>) {
        employees.update(currentEmployees => {
            return currentEmployees.map(emp => 
                emp.id === employeeId ? { ...emp, ...updates } : emp
            );
        });
    },

    // Add a new employee
    addEmployee(employee: Employee) {
        employees.update(currentEmployees => [...currentEmployees, employee]);
    },

    // Set routes for a specific employee
    setEmployeeRoutes(employeeId: string, availableRoutes: Route[], currentRoute: Route | null = null) {
        routesByEmployee.update(routes => ({
            ...routes,
            [employeeId]: {
                available: availableRoutes,
                current: currentRoute
            }
        }));
    },

    // Update available routes for an employee
    setAvailableRoutes(employeeId: string, availableRoutes: Route[]) {
        routesByEmployee.update(routes => ({
            ...routes,
            [employeeId]: {
                ...routes[employeeId],
                available: availableRoutes
            }
        }));
    },

    // Update current route for an employee
    setCurrentRoute(employeeId: string, currentRoute: Route | null) {
        routesByEmployee.update(routes => ({
            ...routes,
            [employeeId]: {
                ...routes[employeeId],
                current: currentRoute
            }
        }));
    },

    // Clear current route for an employee (when route is completed)
    clearCurrentRoute(employeeId: string) {
        routesByEmployee.update(routes => ({
            ...routes,
            [employeeId]: {
                ...routes[employeeId],
                current: null
            }
        }));
    },

    // Clear all data (for logout or game switch)
    clear() {
        currentUser.set(null);
        currentGameState.set(null);
        employees.set([]);
        routesByEmployee.set({});
    }
};

// API helpers that update stores automatically
export const gameDataAPI = {
    // Refresh employee data from server
    async refreshEmployee(employeeId: string) {
        try {
            const response = await fetch(`/api/employees/${employeeId}`);
            if (response.ok) {
                const updatedEmployee = await response.json();
                gameDataActions.updateEmployee(employeeId, updatedEmployee);
                return updatedEmployee;
            } else {
                throw new Error('Failed to refresh employee data');
            }
        } catch (error) {
            console.error('Error refreshing employee:', error);
            addError('Failed to refresh employee data', 'error');
            throw error;
        }
    },

    // Load routes for all employees
    async loadAllEmployeeRoutes() {
        const currentEmployees = get(employees);
        
        log.debug('[ROUTES DEBUG] Starting loadAllEmployeeRoutes');
        log.debug('[ROUTES DEBUG] Number of employees:', currentEmployees.length);
        
        try {
            for (const employee of currentEmployees) {
                log.debug('[ROUTES DEBUG] Processing employee:', employee.id, employee.name);
                log.debug('[ROUTES DEBUG] Employee availableRoutes raw:', employee.availableRoutes);
                log.debug('[ROUTES DEBUG] Employee availableRoutes type:', typeof employee.availableRoutes);
                
                // Handle both SQLite (string) and PostgreSQL (array/object) formats
                let availableRouteIds: string[] = [];
                try {
                    if (typeof employee.availableRoutes === 'string') {
                        // SQLite format - parse JSON string
                        availableRouteIds = JSON.parse(employee.availableRoutes) as string[];
                    } else if (Array.isArray(employee.availableRoutes)) {
                        // PostgreSQL format - already an array
                        availableRouteIds = employee.availableRoutes as string[];
                    } else {
                        // Fallback - empty array
                        log.warn('[ROUTES DEBUG] Unexpected availableRoutes format, using empty array');
                        availableRouteIds = [];
                    }
                } catch (parseError) {
                    log.error('[ROUTES DEBUG] Error parsing availableRoutes:', parseError);
                    availableRouteIds = [];
                }
                
                log.debug('[ROUTES DEBUG] Parsed availableRouteIds:', availableRouteIds);
                
                let availableRoutes: Route[] = [];
                
                if (availableRouteIds.length > 0) {
                    log.debug('[ROUTES DEBUG] Fetching routes:', `/api/routes?ids=${availableRouteIds.join(',')}`);
                    const routesResponse = await fetch(`/api/routes?ids=${availableRouteIds.join(',')}`);
                    log.debug('[ROUTES DEBUG] Routes response status:', routesResponse.status);
                    
                    if (routesResponse.ok) {
                        availableRoutes = await routesResponse.json();
                        log.debug('[ROUTES DEBUG] Fetched available routes:', availableRoutes.length);
                    } else {
                        const errorText = await routesResponse.text();
                        log.error('[ROUTES DEBUG] Failed to fetch available routes:', routesResponse.status, errorText);
                    }
                } else {
                    log.debug('[ROUTES DEBUG] No available route IDs to fetch');
                }

                // Get current route if assigned
                let currentRoute: Route | null = null;
                if (employee.currentRoute) {
                    log.debug('[ROUTES DEBUG] Fetching current route:', `/api/routes/${employee.currentRoute}`);
                    const routeResponse = await fetch(`/api/routes/${employee.currentRoute}`);
                    log.debug('[ROUTES DEBUG] Current route response status:', routeResponse.status);
                    
                    if (routeResponse.ok) {
                        currentRoute = await routeResponse.json();
                        log.debug('[ROUTES DEBUG] Fetched current route:', currentRoute?.id);
                    } else {
                        const errorText = await routeResponse.text();
                        log.error('[ROUTES DEBUG] Failed to fetch current route:', routeResponse.status, errorText);
                    }
                } else {
                    log.debug('[ROUTES DEBUG] No current route assigned');
                }

                log.debug('[ROUTES DEBUG] Setting employee routes for:', employee.id, 'available:', availableRoutes.length, 'current:', currentRoute?.id || 'none');
                gameDataActions.setEmployeeRoutes(employee.id, availableRoutes, currentRoute);
            }
            log.debug('[ROUTES DEBUG] Successfully loaded all employee routes');
        } catch (error) {
            log.error('[ROUTES DEBUG] Error loading employee routes:', error);
            addError('Failed to load employee routes', 'error');
            throw error;
        }
    },

    // Add money using cheats API
    async addMoney(amount: number) {
        const gameState = get(currentGameState);
        const user = get(currentUser);
        
        if (!gameState || !user?.cheatsEnabled) {
            throw new Error('Cannot add money: No game state or cheats not enabled');
        }

        try {
            const response = await fetch('/api/cheats/add-money', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameStateId: gameState.id,
                    amount: amount
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to add money');
            }

            const result = await response.json();
            
            // Update the store with the new balance
            gameDataActions.updateMoney(result.newBalance);
            
            return result;
        } catch (error) {
            log.error('Error adding money:', error);
            addError(`Failed to add money: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
        }
    },

    // Toggle cheats enabled status
    async toggleCheats() {
        const user = get(currentUser);
        if (!user) {
            throw new Error('No user logged in');
        }

        try {
            const response = await fetch('/api/cheats/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !user.cheatsEnabled })
            });

            if (!response.ok) {
                throw new Error('Failed to update cheats setting');
            }

            const result = await response.json();
            
            // Update the store
            gameDataActions.setCheatsEnabled(result.cheatsEnabled);
            
            return result;
        } catch (error) {
            log.error('Error toggling cheats:', error);
            addError(`Failed to toggle cheats: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
        }
    },

    // Create a new game state
    async createGameState(name: string) {
        try {
            const response = await fetch('/api/game-states', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create game state');
            }

            const newGameState = await response.json();
            
            // Add to the store
            gameDataActions.addGameState(newGameState);
            
            return newGameState;
        } catch (error) {
            log.error('Error creating game state:', error);
            addError(`Failed to create game state: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
        }
    },

    // Delete a game state
    async deleteGameState(gameStateId: string) {
        try {
            const response = await fetch('/api/game-states', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameStateId })
            });

            if (!response.ok) {
                throw new Error('Failed to delete game state');
            }

            // Remove from the store
            gameDataActions.removeGameState(gameStateId);
            
            return true;
        } catch (error) {
            log.error('Error deleting game state:', error);
            addError(`Failed to delete game state: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
        }
    },

    // Instantly complete all active routes using cheats API
    async completeAllRoutes() {
        const gameState = get(currentGameState);
        const user = get(currentUser);
        
        log.debug('[CHEAT UI] Starting completeAllRoutes');
        log.debug('[CHEAT UI] Game state:', gameState?.id);
        log.debug('[CHEAT UI] User cheats enabled:', user?.cheatsEnabled);
        
        if (!gameState || !user?.cheatsEnabled) {
            const error = 'Cannot complete routes: No game state or cheats not enabled';
            log.error('[CHEAT UI]', error);
            throw new Error(error);
        }

        try {
            log.debug('[CHEAT UI] Making API call to /api/cheats/complete-routes');
            const response = await fetch('/api/cheats/complete-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameStateId: gameState.id
                })
            });

            log.debug('[CHEAT UI] API response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                log.error('[CHEAT UI] API error response:', errorData);
                throw new Error(errorData.message || 'Failed to complete routes');
            }

            const result = await response.json();
            log.debug('[CHEAT UI] API success response:', result);
            
            // Update the store with the new balance if money was added
            if (result.newBalance) {
                log.debug('[CHEAT UI] Updating money in store:', result.newBalance);
                gameDataActions.updateMoney(result.newBalance);
            }
            
            // Refresh employee data and routes to reflect the changes
            log.debug('[CHEAT UI] Refreshing employee data...');
            await this.refreshEmployees();
            log.debug('[CHEAT UI] Loading employee routes...');
            await this.loadAllEmployeeRoutes();
            
            log.debug('[CHEAT UI] Complete routes cheat finished successfully');
            return result;
        } catch (error) {
            log.error('[CHEAT UI] Error completing routes:', error);
            addError(`Failed to complete routes: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
        }
    },

    // Regenerate routes for all employees using cheats API
    async regenerateAllRoutes() {
        const gameState = get(currentGameState);
        const user = get(currentUser);
        
        if (!gameState || !user?.cheatsEnabled) {
            throw new Error('Cannot regenerate routes: No game state or cheats not enabled');
        }

        try {
            const response = await fetch('/api/cheats/regenerate-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameStateId: gameState.id
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to regenerate routes');
            }

            const result = await response.json();
            
            // Refresh employee data and routes to reflect the changes
            await this.refreshEmployees();
            await this.loadAllEmployeeRoutes();
            
            return result;
        } catch (error) {
            log.error('Error regenerating routes:', error);
            addError(`Failed to regenerate routes: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
        }
    },

    // Refresh all employee data from server
    async refreshEmployees() {
        const gameState = get(currentGameState);
        if (!gameState) {
            throw new Error('No game state available');
        }

        try {
            // This would require a new endpoint to get all employees for a game state
            // For now, let's refresh each employee individually
            const currentEmployees = get(employees);
            for (const employee of currentEmployees) {
                await this.refreshEmployee(employee.id);
            }
        } catch (error) {
            log.error('Error refreshing employees:', error);
            addError('Failed to refresh employees', 'error');
            throw error;
        }
    }
};

// Helper to get current employee routes
export function getEmployeeRoutes(employeeId: string) {
    return derived(routesByEmployee, ($routesByEmployee) => {
        return $routesByEmployee[employeeId] || { available: [], current: null };
    });
}