<script lang="ts">
	import '../app.css';
	import Navigation from '$lib/components/Navigation.svelte';

	let { children } = $props();
</script>

<div class="app flex min-h-screen flex-col">
	<Navigation />

	<main class="w-full flex-1">
		{@render children()}
	</main>

	<footer class="mt-auto bg-base-200 py-6 text-center text-base-content/70">
		<p>© {new Date().getFullYear()} Routing App</p>
	</footer>
</div>
