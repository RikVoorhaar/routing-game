<script lang="ts">
	import '../app.css';
	import Navigation from '$lib/components/Navigation.svelte';

	let { children } = $props();
</script>

<div class="app flex flex-col min-h-screen">
	<Navigation />

	<main class="flex-1 w-full">
		{@render children()}
	</main>

	<footer class="bg-base-200 py-6 text-center mt-auto text-base-content/70">
		<p>© {new Date().getFullYear()} Routing App</p>
	</footer>
</div>
