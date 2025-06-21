<script lang="ts">
	import Cheat from './Cheat.svelte';
	import { cheatsEnabled } from '$lib/stores/cheats';

	let isCollapsed = true;

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}
</script>

{#if $cheatsEnabled}
	<div class="card mb-4 border border-warning/30 bg-warning/10 shadow-lg">
		<div class="card-body p-4">
			<div
				class="-m-2 mb-2 flex cursor-pointer items-center justify-between rounded p-2 transition-colors hover:bg-warning/5"
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
					<h3 class="card-title text-lg text-warning">🔧 Developer Cheats</h3>
					<div class="badge badge-warning badge-sm">DEV MODE</div>
				</div>
				<div class="text-lg font-bold text-warning">
					{isCollapsed ? '▼' : '▲'}
				</div>
			</div>

			{#if !isCollapsed}
				<div class="divider my-2"></div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					<Cheat />
				</div>
			{/if}
		</div>
	</div>
{/if}
