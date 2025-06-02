<script>
    import { page } from '$app/stores';
    import { signOut } from '@auth/sveltekit/client';
</script>

<main class="min-h-screen bg-base-200">
    <div class="max-w-4xl mx-auto px-4 py-16">
        <div class="text-center mb-12">
            <h1 class="text-5xl font-bold text-primary mb-4">🚛 Routing Game</h1>
            <p class="text-xl text-base-content/70">Master the art of logistics and route optimization</p>
        </div>
        
        <div class="card bg-base-100 shadow-xl max-w-md mx-auto">
            <div class="card-body text-center">
                {#if $page.data.session}
                    <h2 class="card-title justify-center text-2xl mb-4">
                        Welcome back!
                    </h2>
                    <p class="mb-6">
                        Hello, <strong class="text-primary">{$page.data.session.user?.name || $page.data.session.user?.email || 'User'}</strong>!
                    </p>
                    <div class="card-actions flex-col gap-3">
                        <a href="/character-select" class="btn btn-primary btn-lg w-full">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                                </path>
                            </svg>
                            Select Character
                        </a>
                        <a href="/protected" class="btn btn-outline btn-secondary">Dashboard</a>
                        <button 
                            class="btn btn-ghost btn-sm"
                            on:click={() => signOut({ callbackUrl: '/' })}
                        >
                            Sign Out
                        </button>
                    </div>
                {:else}
                    <h2 class="card-title justify-center text-2xl mb-4">
                        Get Started
                    </h2>
                    <p class="text-base-content/70 mb-6">
                        Sign in to start your routing adventure and build your logistics empire!
                    </p>
                    <div class="card-actions justify-center">
                        <a href="/login" class="btn btn-primary btn-lg">
                            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1">
                                </path>
                            </svg>
                            Sign In
                        </a>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Game Features Section -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            <div class="card bg-base-100 shadow-lg">
                <div class="card-body text-center">
                    <div class="text-4xl mb-4">🗺️</div>
                    <h3 class="card-title justify-center">Route Planning</h3>
                    <p class="text-sm text-base-content/70">
                        Plan optimal routes to maximize efficiency and profits
                    </p>
                </div>
            </div>
            
            <div class="card bg-base-100 shadow-lg">
                <div class="card-body text-center">
                    <div class="text-4xl mb-4">👥</div>
                    <h3 class="card-title justify-center">Manage Employees</h3>
                    <p class="text-sm text-base-content/70">
                        Hire and upgrade your team to expand your operations
                    </p>
                </div>
            </div>
            
            <div class="card bg-base-100 shadow-lg">
                <div class="card-body text-center">
                    <div class="text-4xl mb-4">💰</div>
                    <h3 class="card-title justify-center">Build Your Empire</h3>
                    <p class="text-sm text-base-content/70">
                        Earn money and grow your logistics business
                    </p>
                </div>
            </div>
        </div>
    </div>
</main>
