import { writable, derived } from 'svelte/store';
import { fullEmployeeData } from './gameData';
import type { FullEmployeeData } from '$lib/server/db/schema';

export const selectedEmployee = writable<string | null>(null);

export function selectEmployee(employeeId: string | null) {
	console.log('[SelectedEmployee] Selecting employee:', employeeId);
	selectedEmployee.set(employeeId);
}
