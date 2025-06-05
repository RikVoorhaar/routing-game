<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { children } = $props();

	// Helper function to safely check session
	function hasValidSession() {
		return !!($page.data?.session?.user);
	}
</script>

<div class="app">
	<header>
		<nav>
			<div class="logo">
				<a href="/">Routing App</a>
			</div>
			<div class="nav-links">
				<a href="/" class:active={$page.url.pathname === '/'}>Home</a>
				{#if hasValidSession()}
					<a href="/protected" class:active={$page.url.pathname === '/protected'}>Protected</a>
				{:else}
					<a href="/login" class:active={$page.url.pathname === '/login'}>Login</a>
				{/if}
			</div>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>

	<footer>
		<p>© {new Date().getFullYear()} Routing App</p>
	</footer>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	header {
		background-color: #f8f9fa;
		padding: 1rem 0;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	nav {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 1rem;
	}

	.logo a {
		font-weight: bold;
		font-size: 1.25rem;
		color: #333;
		text-decoration: none;
	}

	.nav-links {
		display: flex;
		gap: 1.5rem;
	}

	.nav-links a {
		color: #6c757d;
		text-decoration: none;
		transition: color 0.2s;
	}

	.nav-links a:hover {
		color: #4a7dff;
	}

	.nav-links a.active {
		color: #4a7dff;
		font-weight: 500;
	}

	main {
		flex: 1;
		width: 100%;
	}

	footer {
		background-color: #f8f9fa;
		padding: 1.5rem 0;
		text-align: center;
		margin-top: auto;
		color: #6c757d;
	}
</style>
