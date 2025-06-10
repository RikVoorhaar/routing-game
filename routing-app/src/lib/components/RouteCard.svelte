<script lang="ts">
    import type { Route, Address } from '$lib/types';
    import { selectedRoute, selectRoute } from '$lib/stores/selectedRoute';
    import { formatMoney, formatAddress, formatRouteDuration, formatWeight } from '$lib/formatting';

    export let route: Route;

    $: isSelected = $selectedRoute === route.id;
    $: startLocation = JSON.parse(route.startLocation as string) as Address;
    $: endLocation = JSON.parse(route.endLocation as string) as Address;

    function handleClick() {
        if (isSelected) {
            selectRoute(null); // Deselect if already selected
        } else {
            selectRoute(route.id);
        }
    }
</script>

<div 
    class="card p-2 border-2 cursor-pointer transition-all duration-200 ease-in-out hover:shadow-md transform"
    class:border-blue-500={isSelected}
    class:bg-blue-600={isSelected}
    class:text-white={isSelected}
    class:border-gray-300={!isSelected}
    class:bg-base-100={!isSelected}
    class:hover:border-blue-400={!isSelected}
    class:shadow-lg={isSelected}
    class:scale-[1.02]={isSelected}
    class:hover:scale-[1.01]={!isSelected}
    on:click={handleClick}
    on:keydown={(e) => e.key === 'Enter' && handleClick()}
    role="button"
    tabindex="0"
    aria-pressed={isSelected}
    aria-label="Route from {formatAddress(startLocation)} to {formatAddress(endLocation)}"
>
    <div class="card-body p-2">
        <!-- Header with goods type and reward -->
        <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
                <div class="badge badge-sm" class:badge-primary={!isSelected} class:badge-outline={isSelected}>
                    {route.goodsType}
                </div>
                <span class="text-sm opacity-70">#{route.id.slice(-6)}</span>
            </div>
            <div class="text-right">
                <div class="font-bold text-lg" class:text-success={!isSelected}>
                    {formatMoney(route.reward)}
                </div>
            </div>
        </div>

        <!-- Route info -->
        <div class="space-y-1 text-sm">
            <!-- From/To locations -->
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <div class="font-medium text-xs opacity-70 uppercase tracking-wide">From</div>
                    <div class="text-xs leading-tight">{formatAddress(startLocation)}</div>
                </div>
                <div>
                    <div class="font-medium text-xs opacity-70 uppercase tracking-wide">To</div>
                    <div class="text-xs leading-tight">{formatAddress(endLocation)}</div>
                </div>
            </div>

            <!-- Route details -->
            <div class="divider my-1"></div>
            <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="flex justify-between">
                    <span class="opacity-70">Duration:</span>
                    <span class="font-medium">{formatRouteDuration(route.lengthTime)}</span>
                </div>
                <div class="flex justify-between">
                    <span class="opacity-70">Weight:</span>
                    <span class="font-medium">{formatWeight(route.weight)}</span>
                </div>
            </div>
        </div>
    </div>
</div> 