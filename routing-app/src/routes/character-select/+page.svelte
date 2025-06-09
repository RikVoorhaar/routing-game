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
    <div class="navbar bg-base-100 shadow-lg">
        <div class="flex-1">
            <a href="/" class="btn btn-ghost text-xl">🚛 Routing Game</a>
        </div>
        <div class="flex-none">
            <div class="dropdown dropdown-end">
                <div tabindex="0" role="button" class="btn btn-ghost btn-circle avatar">
                    <div class="w-10 rounded-full">
                        {#if session?.user?.image}
                            <img src={session.user.image} alt="Profile" />
                        {:else}
                            <div class="bg-neutral text-neutral-content rounded-full w-10 h-10 flex items-center justify-center">
                                {session?.user?.name?.[0] || session?.user?.email?.[0] || 'U'}
                            </div>
                        {/if}
                    </div>
                </div>
                <ul class="mt-3 z-[1] p-2 shadow menu menu-sm dropdown-content bg-base-100 rounded-box w-52">
                    <li><a href="/profile">Profile</a></li>
                    <li><a href="/protected">Dashboard</a></li>
                    <li><a href="/api/auth/signout">Logout</a></li>
                </ul>
            </div>
        </div>
    </div>

    <CharacterSelection {gameStates} />
</main> 