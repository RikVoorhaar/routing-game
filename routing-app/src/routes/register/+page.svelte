<script lang="ts">
    import { goto } from '$app/navigation';
    
    let username = '';
    let password = '';
    let confirmPassword = '';
    let email = '';
    let name = '';
    let loading = false;
    let error = '';
    let success = '';
    
    // Basic form validation
    $: passwordsMatch = password === confirmPassword;
    $: isPasswordValid = password.length >= 8;
    $: isFormValid = username && isPasswordValid && passwordsMatch && (!email || isEmailValid(email));
    
    function isEmailValid(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    async function handleSubmit() {
        loading = true;
        error = '';
        success = '';
        
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    password,
                    email: email || undefined,
                    name: name || undefined
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                error = data.error || 'Registration failed';
                return;
            }
            
            success = 'Account created successfully! Redirecting to login...';
            
            // Redirect to login after a short delay
            setTimeout(() => {
                goto('/login');
            }, 2000);
        } catch (err) {
            console.error('Registration error:', err);
            error = 'An unexpected error occurred';
        } finally {
            loading = false;
        }
    }
</script>

<div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <div class="card w-full max-w-md bg-base-100 shadow-xl">
        <div class="card-body">
            <h1 class="text-3xl font-bold text-center text-primary mb-2">🚛 Routing Game</h1>
            <h2 class="text-xl font-semibold text-center mb-6">Create an Account</h2>
            
            {#if error}
                <div class="alert alert-error mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                </div>
            {/if}
            
            {#if success}
                <div class="alert alert-success mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{success}</span>
                </div>
            {/if}
            
            <form on:submit|preventDefault={handleSubmit} class="space-y-4">
                <div class="form-control">
                    <label class="label" for="username">
                        <span class="label-text">Username <span class="text-error">*</span></span>
                    </label>
                    <input 
                        id="username" 
                        name="username" 
                        type="text" 
                        placeholder="Enter your username"
                        class="input input-bordered w-full"
                        bind:value={username} 
                        required
                        disabled={loading}
                    />
                </div>
                
                <div class="form-control">
                    <label class="label" for="email">
                        <span class="label-text">Email (optional)</span>
                    </label>
                    <input 
                        id="email" 
                        name="email" 
                        type="email" 
                        placeholder="Enter your email"
                        class="input input-bordered w-full"
                        class:input-error={email && !isEmailValid(email)}
                        bind:value={email}
                        disabled={loading}
                    />
                    {#if email && !isEmailValid(email)}
                        <div class="label">
                            <span class="label-text-alt text-error">Please enter a valid email address</span>
                        </div>
                    {/if}
                </div>
                
                <div class="form-control">
                    <label class="label" for="name">
                        <span class="label-text">Full Name (optional)</span>
                    </label>
                    <input 
                        id="name" 
                        name="name" 
                        type="text" 
                        placeholder="Enter your full name"
                        class="input input-bordered w-full"
                        bind:value={name}
                        disabled={loading}
                    />
                </div>
                
                <div class="form-control">
                    <label class="label" for="password">
                        <span class="label-text">Password <span class="text-error">*</span></span>
                    </label>
                    <input 
                        id="password" 
                        name="password" 
                        type="password" 
                        placeholder="Enter your password (min 8 characters)"
                        class="input input-bordered w-full"
                        class:input-error={password && !isPasswordValid}
                        bind:value={password} 
                        required
                        disabled={loading}
                    />
                    {#if password && !isPasswordValid}
                        <div class="label">
                            <span class="label-text-alt text-error">Password must be at least 8 characters long</span>
                        </div>
                    {/if}
                </div>
                
                <div class="form-control">
                    <label class="label" for="confirmPassword">
                        <span class="label-text">Confirm Password <span class="text-error">*</span></span>
                    </label>
                    <input 
                        id="confirmPassword" 
                        name="confirmPassword" 
                        type="password" 
                        placeholder="Confirm your password"
                        class="input input-bordered w-full"
                        class:input-error={confirmPassword && !passwordsMatch}
                        bind:value={confirmPassword} 
                        required
                        disabled={loading}
                    />
                    {#if confirmPassword && !passwordsMatch}
                        <div class="label">
                            <span class="label-text-alt text-error">Passwords do not match</span>
                        </div>
                    {/if}
                </div>
                
                <button 
                    type="submit" 
                    class="btn btn-primary w-full" 
                    class:loading={loading}
                    disabled={!isFormValid || loading}
                >
                    {#if loading}
                        <span class="loading loading-spinner loading-sm"></span>
                        Creating Account...
                    {:else}
                        Create Account
                    {/if}
                </button>
            </form>
            
            <div class="divider"></div>
            
            <div class="text-center">
                <p class="text-sm">Already have an account? 
                    <a href="/login" class="link link-primary">Log in here</a>
                </p>
            </div>
        </div>
    </div>
</div> 