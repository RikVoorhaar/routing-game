<script lang="ts">
    import { page } from '$app/stores';
    import { signIn } from '@auth/sveltekit/client';
    
    // Get error from URL query parameter or form
    let error = $page.url.searchParams.get('error') || '';
    
    // Form values
    let username = '';
    let password = '';
    
    // Client-side sign in function
    function handleSignIn(e: SubmitEvent) {
        e.preventDefault();
        signIn('credentials', { 
            username,
            password,
            callbackUrl: '/'
        });
    }
</script>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <div class="card w-full max-w-md bg-base-100 shadow-xl">
        <div class="card-body">
            <h1 class="text-3xl font-bold text-center text-primary mb-6">🚛 Routing Game</h1>
            <h2 class="text-xl font-semibold text-center mb-6">Login</h2>
            
            {#if error}
                <div class="alert alert-error mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                        {#if error === 'CredentialsSignin'}
                            Invalid username or password. Please try again.
                        {:else}
                            Error: {error}
                        {/if}
                    </span>
                </div>
            {/if}
            
            <div class="alert alert-info mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div>
                    <div class="font-bold">Test User Credentials:</div>
                    <div class="text-sm">
                        Username: <kbd class="kbd kbd-sm">testuser</kbd><br>
                        Password: <kbd class="kbd kbd-sm">password123</kbd>
                    </div>
                </div>
            </div>
            
            <form on:submit={handleSignIn} class="space-y-4">
                <div class="form-control">
                    <label class="label" for="username">
                        <span class="label-text">Username</span>
                    </label>
                    <input 
                        id="username" 
                        name="username" 
                        type="text" 
                        placeholder="Enter your username"
                        class="input input-bordered w-full" 
                        bind:value={username} 
                        required
                    />
                </div>
                
                <div class="form-control">
                    <label class="label" for="password">
                        <span class="label-text">Password</span>
                    </label>
                    <input 
                        id="password" 
                        name="password" 
                        type="password" 
                        placeholder="Enter your password"
                        class="input input-bordered w-full" 
                        bind:value={password} 
                        required
                    />
                </div>
                
                <button type="submit" class="btn btn-primary w-full">
                    Sign In
                </button>
            </form>
            
            <div class="divider"></div>
            
            <div class="text-center">
                <p class="text-sm">Don't have an account? 
                    <a href="/register" class="link link-primary">Register here</a>
                </p>
            </div>
            
            {#if $page.data.session}
                <div class="alert alert-success mt-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <div>You are logged in as: <strong>{$page.data.session.user?.name || 'User'}</strong></div>
                        <form action="/signout" method="post" class="mt-2">
                            <button type="submit" class="btn btn-sm btn-outline btn-error">Sign Out</button>
                        </form>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div> 