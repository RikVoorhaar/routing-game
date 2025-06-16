<script lang="ts">
    import { gameDataAPI } from '$lib/stores/gameData';
    import { cheatSettings, cheatActions } from '$lib/stores/cheats';

    let moneyAmount = 0;
    let isProcessing = false;
    let error = '';

    // State for route completion cheat
    let isCompletingRoutes = false;
    let completeRoutesError = '';

    // State for route regeneration cheat
    let isRegeneratingRoutes = false;
    let regenerateRoutesError = '';

    async function handleAddMoney() {
        if (isProcessing || moneyAmount === 0) return;
        
        isProcessing = true;
        error = '';

        try {
            await gameDataAPI.addMoney(moneyAmount);
            
            // Reset the input on success
            moneyAmount = 0;
            
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to add money';
        } finally {
            isProcessing = false;
        }
    }

    async function handleCompleteAllRoutes() {
        if (isCompletingRoutes) return;
        
        console.log('[CHEAT COMPONENT] Starting handleCompleteAllRoutes');
        isCompletingRoutes = true;
        completeRoutesError = '';

        try {
            console.log('[CHEAT COMPONENT] Calling gameDataAPI.completeAllRoutes()');
            const result = await gameDataAPI.completeAllRoutes();
            
            // Show success message or handle result
            console.log('[CHEAT COMPONENT] Routes completed successfully:', result);
            
        } catch (err) {
            console.error('[CHEAT COMPONENT] Error in handleCompleteAllRoutes:', err);
            completeRoutesError = err instanceof Error ? err.message : 'Failed to complete routes';
        } finally {
            console.log('[CHEAT COMPONENT] Finishing handleCompleteAllRoutes');
            isCompletingRoutes = false;
        }
    }

    async function handleRegenerateRoutes() {
        if (isRegeneratingRoutes) return;
        
        isRegeneratingRoutes = true;
        regenerateRoutesError = '';

        try {
            const result = await gameDataAPI.regenerateAllRoutes();
            
            // Show success message or handle result
            console.log('Routes regenerated:', result);
            
        } catch (err) {
            regenerateRoutesError = err instanceof Error ? err.message : 'Failed to regenerate routes';
        } finally {
            isRegeneratingRoutes = false;
        }
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            handleAddMoney();
        }
    }
</script>

<div class="space-y-4">
    <!-- Add Money Cheat -->
    <div class="form-control">
        <div class="label">
            <span class="label-text">💰 Add Money</span>
        </div>
        <div class="input-group">
            <span class="bg-base-300">€</span>
            <input 
                type="number" 
                placeholder="Enter amount (negative to subtract)"
                class="input input-bordered input-sm flex-1"
                class:input-error={error}
                bind:value={moneyAmount}
                disabled={isProcessing}
                on:keydown={handleKeyDown}
            />
            <button 
                class="btn btn-square btn-sm btn-primary"
                disabled={isProcessing || moneyAmount === 0}
                on:click={handleAddMoney}
            >
                {#if isProcessing}
                    <span class="loading loading-spinner loading-xs"></span>
                {:else}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                {/if}
            </button>
        </div>
        {#if error}
            <div class="label">
                <span class="label-text-alt text-error">{error}</span>
            </div>
        {/if}
    </div>

    <!-- Complete All Routes Cheat -->
    <div class="form-control">
        <div class="label">
            <span class="label-text">🏁 Complete All Routes</span>
        </div>
        <button 
            class="btn btn-secondary btn-sm w-full"
            disabled={isCompletingRoutes}
            on:click={handleCompleteAllRoutes}
        >
            {#if isCompletingRoutes}
                <span class="loading loading-spinner loading-xs"></span>
                Completing Routes...
            {:else}
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                Complete All Active Routes
            {/if}
        </button>
        {#if completeRoutesError}
            <div class="label">
                <span class="label-text-alt text-error">{completeRoutesError}</span>
            </div>
        {/if}
    </div>

    <!-- Regenerate Routes Cheat -->
    <div class="form-control">
        <div class="label">
            <span class="label-text">🔄 Regenerate Routes</span>
        </div>
        <button 
            class="btn btn-accent btn-sm w-full"
            disabled={isRegeneratingRoutes}
            on:click={handleRegenerateRoutes}
        >
            {#if isRegeneratingRoutes}
                <span class="loading loading-spinner loading-xs"></span>
                Regenerating Routes...
            {:else}
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Regenerate All Routes
            {/if}
        </button>
        {#if regenerateRoutesError}
            <div class="label">
                <span class="label-text-alt text-error">{regenerateRoutesError}</span>
            </div>
        {/if}
    </div>

    <!-- Tile Debug Toggle -->
    <div class="form-control">
        <div class="label">
            <span class="label-text">🗺️ Tile Debug</span>
        </div>
        <div class="form-control">
            <label class="label cursor-pointer">
                <span class="label-text">Show active map tiles</span>
                <input 
                    type="checkbox" 
                    class="toggle toggle-primary" 
                    bind:checked={$cheatSettings.showTileDebug}
                />
            </label>
        </div>
    </div>
</div> 