<script lang="ts">
    import Cheat from './Cheat.svelte';
    import { cheatsEnabled } from '$lib/stores/cheats';
    
    let isCollapsed = true;

    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }
</script>

{#if $cheatsEnabled}
    <div class="card bg-warning/10 border border-warning/30 shadow-lg mb-4">
        <div class="card-body p-4">
            <div 
                class="flex justify-between items-center mb-2 cursor-pointer hover:bg-warning/5 -m-2 p-2 rounded transition-colors"
                on:click={toggleCollapse}
                role="button"
                tabindex="0"
                on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleCollapse();
                    }
                }}
            >
                <div class="flex items-center gap-2">
                    <h3 class="card-title text-warning text-lg">
                        🔧 Developer Cheats
                    </h3>
                    <div class="badge badge-warning badge-sm">DEV MODE</div>
                </div>
                <div class="text-warning text-lg font-bold">
                    {isCollapsed ? '▼' : '▲'}
                </div>
            </div>
            
            {#if !isCollapsed}
                <div class="divider my-2"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Cheat />

                </div>
            {/if}
        </div>
    </div>
{/if} 