<script lang="ts">
    import { page } from '$app/stores';
    import { signOut } from '@auth/sveltekit/client';
    
    // Helper function to safely check session
    function hasValidSession() {
        return !!($page.data?.session?.user);
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
                <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
                    <div class="w-10 rounded-full">
                        {#if $page.data.session?.user?.image}
                            <img src={$page.data.session.user.image} alt="Profile" />
                        {:else}
                            <div class="bg-neutral text-neutral-content rounded-full w-10 h-10 flex items-center justify-center">
                                {$page.data.session?.user?.name?.[0] || $page.data.session?.user?.email?.[0] || 'U'}
                            </div>
                        {/if}
                    </div>
                </div>
                <ul class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
                    <li><span class="text-xs text-base-content/70 px-4 py-2">{$page.data.session?.user?.name || $page.data.session?.user?.email || 'User'}</span></li>
                    <li><button on:click={handleSignOut}>Sign Out</button></li>
                </ul>
            </div>
        {:else}
            <a href="/login" class="btn btn-primary">Sign In</a>
        {/if}
    </div>
</div> 