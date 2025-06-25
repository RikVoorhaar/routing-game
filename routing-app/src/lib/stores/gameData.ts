import { writable, derived, get } from 'svelte/store';
import type { GameState, Job, Employee, ActiveJob } from '$lib/server/db/schema';
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

// Active jobs store - organized by employee ID for efficient lookup
export const activeJobsByEmployee = writable<Record<string, ActiveJob | null>>({});

// Client-side timers for job completion
const jobCompletionTimers = new Map<string, NodeJS.Timeout>();

// Function to schedule job completion
function scheduleJobCompletion(employeeId: string, activeJob: ActiveJob) {
	if (!activeJob.startTime) return;

	const startTime = new Date(activeJob.startTime).getTime();
	const currentTime = Date.now();

	// Calculate total completion time
	const totalDuration = activeJob.durationSeconds * 1000;
	const elapsed = currentTime - startTime;
	const remainingTime = Math.max(0, totalDuration - elapsed);

	if (remainingTime > 0) {
		log.debug(
			'[GameData] Scheduling job completion for employee',
			employeeId,
			'in',
			remainingTime,
			'ms'
		);

		const timer = setTimeout(async () => {
			log.debug('[GameData] Auto-completing job for employee:', employeeId);
			try {
				await gameDataAPI.completeJob(employeeId, activeJob.id);
			} catch (error) {
				log.error('[GameData] Failed to auto-complete job:', error);
				addError('Failed to complete job automatically', 'error');
			}
		}, remainingTime);

		jobCompletionTimers.set(employeeId, timer);
	} else {
		// Job should already be completed, trigger completion immediately
		log.debug('[GameData] Job already past completion time, completing immediately');
		setTimeout(async () => {
			try {
				await gameDataAPI.completeJob(employeeId, activeJob.id);
			} catch (error) {
				log.error('[GameData] Failed to complete overdue job:', error);
			}
		}, 100);
	}
}

// Derived store for all active jobs (flattened)
export const allActiveJobs = derived(activeJobsByEmployee, ($activeJobsByEmployee) => {
	const activeJobs: ActiveJob[] = [];
	Object.values($activeJobsByEmployee).forEach((activeJob) => {
		if (activeJob) {
			activeJobs.push(activeJob);
		}
	});
	return activeJobs;
});

// Derived store to check if cheats are enabled
export const cheatsEnabled = derived(currentUser, ($currentUser) => {
	return $currentUser?.cheatsEnabled || false;
});

// Current map jobs store
export const currentMapJobs = writable<Job[]>([]);

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
			currentUser.update((user) => (user ? { ...user, cheatsEnabled: data.cheatsEnabled! } : null));
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
		currentUser.update((user) => (user ? { ...user, cheatsEnabled: enabled } : null));
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
		availableGameStates.update((states) => [...states, gameState]);
	},

	// Remove a game state from available list
	removeGameState(gameStateId: string) {
		availableGameStates.update((states) => states.filter((state) => state.id !== gameStateId));
	},

	// Update money in game state
	updateMoney(newAmount: number) {
		currentGameState.update((gameState) => {
			if (!gameState) return null;
			return { ...gameState, money: newAmount };
		});
	},

	// Add money to current balance
	addMoney(amount: number) {
		currentGameState.update((gameState) => {
			if (!gameState) return null;
			return { ...gameState, money: Math.max(0, gameState.money + amount) };
		});
	},

	// Update employees
	setEmployees(newEmployees: Employee[]) {
		employees.set(newEmployees);
		// Clear active jobs when employees change
		activeJobsByEmployee.set({});
	},

	// Update a single employee
	updateEmployee(employeeId: string, updates: Partial<Employee>) {
		employees.update((currentEmployees) => {
			return currentEmployees.map((emp) => (emp.id === employeeId ? { ...emp, ...updates } : emp));
		});
	},

	// Add a new employee
	addEmployee(employee: Employee) {
		employees.update((currentEmployees) => [...currentEmployees, employee]);
	},

	// Set active job for a specific employee and set up completion timer
	setEmployeeActiveJob(employeeId: string, activeJob: ActiveJob | null) {
		activeJobsByEmployee.update((activeJobs) => ({
			...activeJobs,
			[employeeId]: activeJob
		}));

		// Clear any existing timer for this employee
		const existingTimer = jobCompletionTimers.get(employeeId);
		if (existingTimer) {
			clearTimeout(existingTimer);
			jobCompletionTimers.delete(employeeId);
		}

		// Set up completion timer if there's an active job
		if (activeJob && activeJob.startTime) {
			scheduleJobCompletion(employeeId, activeJob);
		}
	},

	// Clear active job for an employee (when job is completed)
	clearEmployeeActiveJob(employeeId: string) {
		activeJobsByEmployee.update((activeJobs) => ({
			...activeJobs,
			[employeeId]: null
		}));

		// Clear any completion timer
		const existingTimer = jobCompletionTimers.get(employeeId);
		if (existingTimer) {
			clearTimeout(existingTimer);
			jobCompletionTimers.delete(employeeId);
		}
	},

	// Update multiple employees at once (for bulk loading)
	setAllEmployeesActiveJobs(
		employeeActiveJobs: Array<{ employeeId: string; activeJob: ActiveJob | null }>
	) {
		// Clear all existing timers
		jobCompletionTimers.forEach((timer) => clearTimeout(timer));
		jobCompletionTimers.clear();

		// Update the store
		const newActiveJobs: Record<string, ActiveJob | null> = {};
		employeeActiveJobs.forEach(({ employeeId, activeJob }) => {
			newActiveJobs[employeeId] = activeJob;

			// Set up completion timer if needed
			if (activeJob && activeJob.startTime) {
				scheduleJobCompletion(employeeId, activeJob);
			}
		});

		activeJobsByEmployee.set(newActiveJobs);
	},

	// Clear all data (for logout or game switch)
	clear() {
		currentUser.set(null);
		currentGameState.set(null);
		employees.set([]);
		activeJobsByEmployee.set({});
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

	// Load all employee and active job data at once (with automatic completion processing)
	async loadAllEmployeeData() {
		const gameState = get(currentGameState);
		if (!gameState) {
			throw new Error('No game state available');
		}

		try {
			log.debug('[GameData] Loading all employee data for game state:', gameState.id);

			// This endpoint will process any completed jobs and return fresh data
			const response = await fetch(`/api/game-states/${gameState.id}/employees-and-jobs`);
			if (!response.ok) {
				throw new Error('Failed to load employee data');
			}

			const data = await response.json();

			// Update employees store
			if (data.employees) {
				gameDataActions.setEmployees(data.employees);
			}

			// Update game state if it changed (money from completed jobs)
			if (data.gameState && data.gameState.money !== gameState.money) {
				gameDataActions.setGameState(data.gameState);
			}

			// Update active jobs with timer scheduling
			if (data.employeeActiveJobs) {
				gameDataActions.setAllEmployeesActiveJobs(data.employeeActiveJobs);
			}

			log.debug('[GameData] Employee data loaded successfully');
			return data;
		} catch (error) {
			log.error('[GameData] Error loading employee data:', error);
			addError('Failed to load employee data', 'error');
			throw error;
		}
	},

	// Complete a specific job
	async completeJob(employeeId: string, activeJobId: string) {
		try {
			log.debug('[GameData] Completing job for employee:', employeeId, 'job:', activeJobId);

			const response = await fetch(`/api/employees/${employeeId}/complete-job`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ activeJobId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to complete job');
			}

			const result = await response.json();

			// Update stores with the completion results
			gameDataActions.updateEmployee(employeeId, result.employee);
			gameDataActions.setGameState(result.gameState);
			gameDataActions.clearEmployeeActiveJob(employeeId);

			log.debug('[GameData] Job completed successfully. Reward:', result.reward);
			return result;
		} catch (error) {
			log.error('[GameData] Error completing job:', error);
			addError('Failed to complete job', 'error');
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
			addError(
				`Failed to add money: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'error'
			);
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
			addError(
				`Failed to toggle cheats: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'error'
			);
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
			addError(
				`Failed to create game state: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'error'
			);
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
			addError(
				`Failed to delete game state: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'error'
			);
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

			// Refresh employee data and active jobs to reflect the changes
			log.debug('[CHEAT UI] Refreshing employee data...');
			await this.loadAllEmployeeData();

			log.debug('[CHEAT UI] Complete routes cheat finished successfully');
			return result;
		} catch (error) {
			log.error('[CHEAT UI] Error completing routes:', error);
			addError(
				`Failed to complete routes: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'error'
			);
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

// Helper to get current employee active job
export function getEmployeeActiveJob(employeeId: string) {
	return derived(activeJobsByEmployee, ($activeJobsByEmployee) => {
		return $activeJobsByEmployee[employeeId] || null;
	});
}
