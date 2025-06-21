import { writable } from 'svelte/store';

export const selectedEmployee = writable<string | null>(null);

export function selectEmployee(employeeId: string | null) {
	console.log('[SelectedEmployee] Selecting employee:', employeeId);
	selectedEmployee.set(employeeId);
}

export function clearEmployeeSelection() {
	console.log('[SelectedEmployee] Clearing employee selection');
	selectedEmployee.set(null);
}
