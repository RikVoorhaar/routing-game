import { writable } from 'svelte/store';
import { nanoid } from 'nanoid';

export interface ErrorMessage {
    id: string;
    message: string;
    type: 'error' | 'warning' | 'info';
    timestamp: number;
    autoDismiss?: boolean;
    dismissAfter?: number; // milliseconds
}

export const errors = writable<ErrorMessage[]>([]);

export function addError(
    message: string, 
    type: 'error' | 'warning' | 'info' = 'error',
    autoDismiss: boolean = true,
    dismissAfter: number = 5000
) {
    const error: ErrorMessage = {
        id: nanoid(),
        message,
        type,
        timestamp: Date.now(),
        autoDismiss,
        dismissAfter
    };

    errors.update(currentErrors => [...currentErrors, error]);

    // Auto-dismiss after specified time
    if (autoDismiss) {
        setTimeout(() => {
            dismissError(error.id);
        }, dismissAfter);
    }

    return error.id;
}

export function dismissError(id: string) {
    errors.update(currentErrors => 
        currentErrors.filter(error => error.id !== id)
    );
}

export function clearAllErrors() {
    errors.set([]);
} 