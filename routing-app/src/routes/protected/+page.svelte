<script>
    import { page } from '$app/stores';
    import { signOut } from '@auth/sveltekit/client';
</script>

<div class="min-h-screen bg-base-200">
    <div class="container mx-auto px-4 py-16">
        <div class="card w-full max-w-2xl mx-auto bg-base-100 shadow-xl">
            <div class="card-body">
                <h1 class="text-3xl font-bold text-center text-primary mb-6">🔒 Protected Page</h1>
                
                {#if $page.data.session && $page.data.session.user}
                    <div class="text-center mb-8">
                        <div class="avatar placeholder mb-4">
                            <div class="bg-neutral text-neutral-content rounded-full w-16">
                                <span class="text-xl">{$page.data.session.user.name?.[0] || $page.data.session.user.email?.[0] || 'U'}</span>
                            </div>
                        </div>
                        <h2 class="text-2xl font-semibold mb-2">
                            Welcome, <span class="text-primary">{$page.data.session.user.name || $page.data.session.user.email || 'User'}</span>!
                        </h2>
                        <p class="text-base-content/70">
                            You are now viewing a protected page that requires authentication.
                        </p>
                    </div>
                    
                    <div class="alert alert-success mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <h3 class="font-bold">Authentication Successful!</h3>
                            <div class="text-xs">You have successfully logged in and can access protected content.</div>
                        </div>
                    </div>
                    
                    <div class="card-actions justify-center">
                        <a href="/character-select" class="btn btn-primary">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Go to Character Select
                        </a>
                        <button class="btn btn-outline btn-error" on:click={() => signOut({ callbackUrl: '/' })}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Sign Out
                        </button>
                    </div>
                {:else}
                    <div class="text-center">
                        <span class="loading loading-spinner loading-lg"></span>
                        <p class="mt-4">Loading user data...</p>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div> 