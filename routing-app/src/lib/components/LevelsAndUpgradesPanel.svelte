<script lang="ts">
	import GlobalXpPanel from './GlobalXpPanel.svelte';
	import UpgradesPanel from './UpgradesPanel.svelte';

	let activeTab: 'levels' | 'upgrades' = 'levels';
</script>

<div class="card flex h-[700px] flex-col bg-base-100 shadow-lg">
	<div class="card-body flex flex-col p-2">
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
				<UpgradesPanel />
			{/if}
		</div>
	</div>
</div>
