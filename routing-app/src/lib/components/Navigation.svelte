<script lang="ts">
	import { page } from '$app/stores';
	import { signOut } from '@auth/sveltekit/client';

	// Helper function to safely check session
	function hasValidSession() {
		return !!$page.data?.session?.user;
	}

	async function handleSignOut() {
		await signOut({ callbackUrl: '/' });
	}
</script>

<div class="navbar bg-base-100 shadow-lg">
	<div class="flex-1">
		<a href="/" class="btn btn-ghost text-xl">🚛 Routing Game</a>
	</div>
	<div class="flex-none">
		{#if hasValidSession()}
			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" class="avatar btn btn-circle btn-ghost">
					<div class="w-10 rounded-full">
						{#if $page.data.session?.user?.image}
							<img src={$page.data.session.user.image} alt="Profile" />
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-neutral text-neutral-content"
							>
								{$page.data.session?.user?.name?.[0] || $page.data.session?.user?.email?.[0] || 'U'}
							</div>
						{/if}
					</div>
				</div>
				<ul
					class="menu dropdown-content menu-sm z-[1] mt-3 w-52 rounded-box bg-base-100 p-2 shadow"
				>
					<li>
						<span class="px-4 py-2 text-xs text-base-content/70"
							>{$page.data.session?.user?.name || $page.data.session?.user?.email || 'User'}</span
						>
					</li>
					<li><button on:click={handleSignOut}>Sign Out</button></li>
				</ul>
			</div>
		{:else}
			<a href="/login" class="btn btn-primary">Sign In</a>
		{/if}
	</div>
</div>
