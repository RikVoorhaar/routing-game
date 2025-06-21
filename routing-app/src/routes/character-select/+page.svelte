<script lang="ts">
	import { page } from '$app/stores';
	import CharacterSelection from '$lib/components/CharacterSelection.svelte';

	$: ({ session, gameStates } = $page.data);
</script>

<svelte:head>
	<title>Character Select - Routing Game</title>
	<meta name="description" content="Select or create a character for the Routing Game" />
</svelte:head>

<main class="min-h-screen bg-base-200">
	<CharacterSelection {gameStates} />
</main>
