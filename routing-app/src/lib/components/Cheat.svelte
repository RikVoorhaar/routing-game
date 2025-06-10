<script lang="ts">
    import { gameDataAPI } from '$lib/stores/gameData';

    let moneyAmount = 0;
    let isProcessing = false;
    let error = '';

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

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            handleAddMoney();
        }
    }
</script>

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