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

<div class="register-container">
    <h1>Create an Account</h1>
    
    {#if error}
        <div class="error">
            <p>{error}</p>
        </div>
    {/if}
    
    {#if success}
        <div class="success">
            <p>{success}</p>
        </div>
    {/if}
    
    <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
            <label for="username">Username <span class="required">*</span></label>
            <input 
                id="username" 
                name="username" 
                type="text" 
                bind:value={username} 
                required
                disabled={loading}
            />
        </div>
        
        <div class="form-group">
            <label for="email">Email</label>
            <input 
                id="email" 
                name="email" 
                type="email" 
                bind:value={email}
                disabled={loading}
            />
            {#if email && !isEmailValid(email)}
                <p class="input-error">Please enter a valid email address</p>
            {/if}
        </div>
        
        <div class="form-group">
            <label for="name">Full Name</label>
            <input 
                id="name" 
                name="name" 
                type="text" 
                bind:value={name}
                disabled={loading}
            />
        </div>
        
        <div class="form-group">
            <label for="password">Password <span class="required">*</span></label>
            <input 
                id="password" 
                name="password" 
                type="password" 
                bind:value={password} 
                required
                disabled={loading}
            />
            {#if password && !isPasswordValid}
                <p class="input-error">Password must be at least 8 characters long</p>
            {/if}
        </div>
        
        <div class="form-group">
            <label for="confirmPassword">Confirm Password <span class="required">*</span></label>
            <input 
                id="confirmPassword" 
                name="confirmPassword" 
                type="password" 
                bind:value={confirmPassword} 
                required
                disabled={loading}
            />
            {#if confirmPassword && !passwordsMatch}
                <p class="input-error">Passwords do not match</p>
            {/if}
        </div>
        
        <button 
            type="submit" 
            class="register-button" 
            disabled={!isFormValid || loading}
        >
            {loading ? 'Creating Account...' : 'Create Account'}
        </button>
        
        <div class="login-link">
            <p>Already have an account? <a href="/login">Log in</a></p>
        </div>
    </form>
</div>

<style>
    .register-container {
        max-width: 400px;
        margin: 80px auto 0;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        background: white;
    }
    
    h1 {
        text-align: center;
        margin-bottom: 1.5rem;
        color: #333;
    }
    
    .form-group {
        margin-bottom: 1rem;
    }
    
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }
    
    .required {
        color: #e53e3e;
    }
    
    input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }
    
    .register-button {
        width: 100%;
        padding: 0.75rem;
        border: none;
        border-radius: 4px;
        background-color: #4a7dff;
        color: white;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
        margin-top: 1rem;
    }
    
    .register-button:hover:not(:disabled) {
        background-color: #3a6ae0;
    }
    
    .register-button:disabled {
        background-color: #a0aec0;
        cursor: not-allowed;
    }
    
    .error {
        color: #e53e3e;
        margin-bottom: 1rem;
        padding: 0.5rem;
        background-color: #fee2e2;
        border-radius: 4px;
        text-align: center;
    }
    
    .success {
        color: #047857;
        margin-bottom: 1rem;
        padding: 0.5rem;
        background-color: #d1fae5;
        border-radius: 4px;
        text-align: center;
    }
    
    .input-error {
        color: #e53e3e;
        font-size: 0.8rem;
        margin-top: 0.25rem;
        margin-bottom: 0;
    }
    
    .login-link {
        text-align: center;
        margin-top: 1.5rem;
    }
    
    a {
        color: #4a7dff;
        text-decoration: none;
    }
    
    a:hover {
        text-decoration: underline;
    }
</style> 