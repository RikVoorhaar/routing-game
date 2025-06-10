import { writable, derived, get } from 'svelte/store';
import type { GameState, Employee, Route } from '$lib/types';
import { addError } from './errors';

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
        
        try {
            for (const employee of currentEmployees) {
                // Get available routes
                const availableRouteIds = JSON.parse(employee.availableRoutes as string) as string[];
                let availableRoutes: Route[] = [];
                
                if (availableRouteIds.length > 0) {
                    const routesResponse = await fetch(`/api/routes?ids=${availableRouteIds.join(',')}`);
                    if (routesResponse.ok) {
                        availableRoutes = await routesResponse.json();
                    }
                }

                // Get current route if assigned
                let currentRoute: Route | null = null;
                if (employee.currentRoute) {
                    const routeResponse = await fetch(`/api/routes/${employee.currentRoute}`);
                    if (routeResponse.ok) {
                        currentRoute = await routeResponse.json();
                    }
                }

                gameDataActions.setEmployeeRoutes(employee.id, availableRoutes, currentRoute);
            }
        } catch (error) {
            console.error('Error loading employee routes:', error);
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
            console.error('Error adding money:', error);
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
            console.error('Error toggling cheats:', error);
            addError(`Failed to toggle cheats: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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