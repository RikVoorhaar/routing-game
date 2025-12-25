<script lang="ts">
	import GlobalXpPanel from './GlobalXpPanel.svelte';
	import UpgradesPanelPlaceholder from './UpgradesPanelPlaceholder.svelte';

	let activeTab: 'levels' | 'upgrades' = 'levels';
</script>

<div class="card h-[700px] bg-base-100 shadow-lg flex flex-col">
	<div class="card-body p-2 flex flex-col">
		<!-- Tab Navigation -->
		<div class="tabs-boxed tabs mb-4 px-4 pt-2">
			<button
				class="tab"
				class:tab-active={activeTab === 'levels'}
				on:click={() => (activeTab = 'levels')}
			>
				Levels & XP
			</button>
			<button
				class="tab"
				class:tab-active={activeTab === 'upgrades'}
				on:click={() => (activeTab = 'upgrades')}
			>
				Upgrades
			</button>
		</div>

		<!-- Tab Content -->
		<div class="flex-1 overflow-y-auto px-4 pb-4">
			{#if activeTab === 'levels'}
				<GlobalXpPanel />
			{:else}
				<UpgradesPanelPlaceholder />
			{/if}
		</div>
	</div>
</div>

