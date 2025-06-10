<script lang="ts">
    import { errors, dismissError, type ErrorMessage } from '$lib/stores/errors';
    import { fly } from 'svelte/transition';

    function getAlertClass(type: ErrorMessage['type']): string {
        switch (type) {
            case 'error':
                return 'alert-error';
            case 'warning':
                return 'alert-warning';
            case 'info':
                return 'alert-info';
            default:
                return 'alert-error';
        }
    }

    function getIcon(type: ErrorMessage['type']): string {
        switch (type) {
            case 'error':
                return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
            case 'warning':
                return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.084 16.5c-.77.833.192 2.5 1.732 2.5z';
            case 'info':
                return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
            default:
                return 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z';
        }
    }
</script>

<!-- Error Overlay Container -->
{#if $errors.length > 0}
    <div class="toast toast-top toast-end z-50 max-w-md">
        {#each $errors as error (error.id)}
            <div 
                class="alert {getAlertClass(error.type)} shadow-lg"
                transition:fly={{ x: 300, duration: 300 }}
            >
                <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    class="stroke-current shrink-0 h-6 w-6" 
                    fill="none" 
                    viewBox="0 0 24 24"
                >
                    <path 
                        stroke-linecap="round" 
                        stroke-linejoin="round" 
                        stroke-width="2" 
                        d={getIcon(error.type)}
                    />
                </svg>
                <div class="flex-1">
                    <span>{error.message}</span>
                </div>
                <button 
                    class="btn btn-ghost btn-sm btn-circle"
                    on:click={() => dismissError(error.id)}
                    aria-label="Dismiss error"
                >
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        class="h-4 w-4" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                    >
                        <path 
                            stroke-linecap="round" 
                            stroke-linejoin="round" 
                            stroke-width="2" 
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
        {/each}
    </div>
{/if} 