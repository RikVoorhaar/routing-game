<script lang="ts">
    import { page } from '$app/stores';
    import CharacterSelection from '$lib/components/CharacterSelection.svelte';
    import LoginForm from '$lib/components/LoginForm.svelte';
    
    $: ({ session, gameStates, cheatsEnabled } = $page.data);
</script>

<svelte:head>
    <title>Routing Game - Logistics Management</title>
    <meta name="description" content="Master the art of logistics and route optimization in the Routing Game" />
</svelte:head>

<main class="min-h-screen bg-base-200">
    {#if session?.user}
        <!-- User is logged in - show character selection -->
        <CharacterSelection {gameStates} />
    {:else}
        <!-- User is not logged in - show login form with features -->
        <div class="max-w-6xl mx-auto px-4 py-16">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <!-- Login Form -->
                <div class="flex justify-center">
                    <LoginForm />
                </div>
                
                <!-- Game Features -->
                <div class="space-y-8">
                    <div class="text-center lg:text-left">
                        <h1 class="text-4xl font-bold text-primary mb-4">Build Your Logistics Empire</h1>
                        <p class="text-xl text-base-content/70">Master the art of route optimization and grow your business</p>
                    </div>
                    
                    <div class="grid grid-cols-1 gap-6">
                        <div class="card bg-base-100 shadow-lg">
                            <div class="card-body">
                                <div class="flex items-center gap-4">
                                    <div class="text-4xl">🗺️</div>
                                    <div>
                                        <h3 class="text-lg font-bold">Route Planning</h3>
                                        <p class="text-sm text-base-content/70">
                                            Plan optimal routes to maximize efficiency and profits
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card bg-base-100 shadow-lg">
                            <div class="card-body">
                                <div class="flex items-center gap-4">
                                    <div class="text-4xl">👥</div>
                                    <div>
                                        <h3 class="text-lg font-bold">Manage Employees</h3>
                                        <p class="text-sm text-base-content/70">
                                            Hire and upgrade your team to expand your operations
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card bg-base-100 shadow-lg">
                            <div class="card-body">
                                <div class="flex items-center gap-4">
                                    <div class="text-4xl">💰</div>
                                    <div>
                                        <h3 class="text-lg font-bold">Build Your Empire</h3>
                                        <p class="text-sm text-base-content/70">
                                            Earn money and grow your logistics business
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</main>
