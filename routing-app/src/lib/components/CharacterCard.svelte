<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { GameState } from '$lib/server/db/schema';

	export let character: GameState;

	const dispatch = createEventDispatcher<{
		delete: { id: string; name: string };
		select: { id: string; name: string };
	}>();

	let showDeleteModal = false;
	let isDeleting = false;

	function handleDeleteClick() {
		showDeleteModal = true;
	}

	function handleDeleteConfirm() {
		isDeleting = true;
		dispatch('delete', { id: character.id, name: character.name });
	}

	function handleSelectCharacter() {
		dispatch('select', { id: character.id, name: character.name });
	}

	function formatMoney(amount: string | number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'EUR',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(Number(amount));
	}

	function formatDate(date: string | Date): string {
		const dateObj = date instanceof Date ? date : new Date(date);
		return dateObj.toLocaleDateString();
	}
</script>

<div class="card bg-base-100 shadow-xl transition-shadow duration-300 hover:shadow-2xl">
	<div class="card-body">
		<h2 class="card-title text-2xl font-bold text-primary">{character.name}</h2>

		<div class="stats stats-vertical shadow lg:stats-horizontal">
			<div class="stat">
				<div class="stat-title">Money</div>
				<div class="stat-value text-success">{formatMoney(character.money)}</div>
			</div>
		</div>

		<div class="mt-2 text-sm text-base-content/70">
			Created: {formatDate(character.createdAt)}
		</div>

		<div class="card-actions mt-4 justify-end">
			<button class="btn btn-success btn-sm" on:click={handleSelectCharacter}>
				Select Character
			</button>
			<button class="btn btn-error btn-sm" on:click={handleDeleteClick} disabled={isDeleting}>
				{#if isDeleting}
					<span class="loading loading-spinner loading-xs"></span>
					Deleting...
				{:else}
					Delete
				{/if}
			</button>
		</div>
	</div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
	<div class="modal modal-open">
		<div class="modal-box">
			<h3 class="text-lg font-bold">Confirm Deletion</h3>
			<p class="py-4">
				Are you sure you want to delete the character <strong>"{character.name}"</strong>? This
				action cannot be undone and will permanently delete all progress for this character.
			</p>
			<div class="modal-action">
				<button
					class="btn btn-ghost"
					on:click={() => (showDeleteModal = false)}
					disabled={isDeleting}
				>
					Cancel
				</button>
				<button class="btn btn-error" on:click={handleDeleteConfirm} disabled={isDeleting}>
					{#if isDeleting}
						<span class="loading loading-spinner loading-xs"></span>
						Deleting...
					{:else}
						Delete Character
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
