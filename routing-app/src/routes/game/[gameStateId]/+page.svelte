<script lang="ts">
	import { page } from '$app/stores';
	import GameState from '$lib/components/GameState.svelte';

	$: ({ session, gameState, employees, cheatsEnabled } = $page.data);
</script>

<svelte:head>
	<title>{gameState?.name || 'Game'} - Routing Game</title>
	<meta name="description" content="Play the Routing Game - manage employees and routes" />
</svelte:head>

{#if gameState}
	<GameState {gameState} initialEmployees={employees} {cheatsEnabled} />
{:else}
	<div class="flex min-h-screen items-center justify-center bg-base-200">
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body text-center">
				<h1 class="text-2xl font-bold text-error">Game State Not Found</h1>
				<p class="text-base-content/70">
					The requested game state could not be found or you don't have access to it.
				</p>
				<div class="card-actions mt-4 justify-center">
					<a href="/character-select" class="btn btn-primary"> Back to Character Select </a>
				</div>
			</div>
		</div>
	</div>
{/if}
