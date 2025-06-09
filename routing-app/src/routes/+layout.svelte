<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { children } = $props();

	// Helper function to safely check session
	function hasValidSession() {
		return !!($page.data?.session?.user);
	}
</script>

<div class="app flex flex-col min-h-screen">
	<header class="bg-base-200 py-4 shadow-sm">
		<nav class="max-w-6xl mx-auto flex justify-between items-center px-4">
			<div class="logo">
				<a href="/" class="font-bold text-xl text-base-content no-underline">Routing App</a>
			</div>
			<div class="nav-links flex gap-6">
				<a href="/" class="text-base-content/70 no-underline transition-colors hover:text-primary" class:text-primary={$page.url.pathname === '/'} class:font-medium={$page.url.pathname === '/'}>Home</a>
				{#if hasValidSession()}
					<a href="/protected" class="text-base-content/70 no-underline transition-colors hover:text-primary" class:text-primary={$page.url.pathname === '/protected'} class:font-medium={$page.url.pathname === '/protected'}>Protected</a>
				{:else}
					<a href="/login" class="text-base-content/70 no-underline transition-colors hover:text-primary" class:text-primary={$page.url.pathname === '/login'} class:font-medium={$page.url.pathname === '/login'}>Login</a>
				{/if}
			</div>
		</nav>
	</header>

	<main class="flex-1 w-full">
		{@render children()}
	</main>

	<footer class="bg-base-200 py-6 text-center mt-auto text-base-content/70">
		<p>© {new Date().getFullYear()} Routing App</p>
	</footer>
</div>
