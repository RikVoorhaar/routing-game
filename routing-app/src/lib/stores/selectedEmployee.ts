import { writable, derived } from 'svelte/store';
import { fullEmployeeData } from './gameData';
import type { FullEmployeeData } from '$lib/server/db/schema';

export const selectedEmployee = writable<string | null>(null);

// Derived store that provides the full employee data for the selected employee
export const selectedFullEmployeeData = derived(
	[selectedEmployee, fullEmployeeData],
	([$selectedEmployee, $fullEmployeeData]): FullEmployeeData | null => {
		if (!$selectedEmployee) return null;
		return $fullEmployeeData.find((fed) => fed.employee.id === $selectedEmployee) || null;
	}
);

export function selectEmployee(employeeId: string | null) {
	console.log('[SelectedEmployee] Selecting employee:', employeeId);
	selectedEmployee.set(employeeId);
}

export function clearEmployeeSelection() {
	console.log('[SelectedEmployee] Clearing employee selection');
	selectedEmployee.set(null);
}
