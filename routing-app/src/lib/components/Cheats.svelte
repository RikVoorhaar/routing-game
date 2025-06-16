<script lang="ts">
    import Cheat from './Cheat.svelte';
    import { cheatsEnabled } from '$lib/stores/cheats';
    
    let isCollapsed = false;

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }
</script>

{#if $cheatsEnabled}
    <div class="card bg-warning/10 border border-warning/30 shadow-lg mb-4">
        <div class="card-body p-4">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2">
                    <h3 class="card-title text-warning text-lg">
                        🔧 Developer Cheats
                    </h3>
                    <div class="badge badge-warning badge-sm">DEV MODE</div>
                </div>
                <button 
                    class="btn btn-ghost btn-xs"
                    on:click={toggleCollapse}
                >
                    {isCollapsed ? '▼' : '▲'}
                </button>
            </div>
            
            {#if !isCollapsed}
                <div class="divider my-2"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Cheat />
                    <!-- Future cheats can be added here -->
                    <div class="text-center text-base-content/50 text-sm py-4">
                        More cheats coming soon...
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if} 