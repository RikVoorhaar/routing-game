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

<div class="login-container">
    <h1>Login</h1>
    
    <p>Current route: {$page.url.pathname}</p>
    
    {#if error}
        <div class="error">
            {#if error === 'CredentialsSignin'}
                <p>Invalid username or password. Please try again.</p>
            {:else}
                <p>Error: {error}</p>
            {/if}
        </div>
    {/if}
    
    <div class="test-user-info">
        <p><strong>Test User Credentials:</strong></p>
        <p>Username: <code>testuser</code></p>
        <p>Password: <code>password123</code></p>
    </div>
    
    <form on:submit={handleSignIn}>
        <div class="form-group">
            <label for="username">Username</label>
            <input 
                id="username" 
                name="username" 
                type="text" 
                bind:value={username} 
                required
            />
        </div>
        <div class="form-group">
            <label for="password">Password</label>
            <input 
                id="password" 
                name="password" 
                type="password" 
                bind:value={password} 
                required
            />
        </div>
        <button type="submit" class="login-button">Sign in</button>
    </form>
    
    <div class="register-link">
        <p>Don't have an account? <a href="/register">Register</a></p>
    </div>
    
    {#if $page.data.session}
        <div class="success-message">
            <p>You are logged in as: <strong>{$page.data.session.user?.name || 'User'}</strong></p>
            <form action="/signout" method="post">
                <button type="submit" class="logout-button">Sign Out</button>
            </form>
        </div>
    {/if}
</div>

<style>
    .login-container {
        max-width: 400px;
        margin: 100px auto 0;
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
    
    input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }
    
    .login-button, .logout-button {
        width: 100%;
        padding: 0.75rem;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
        color: white;
    }
    
    .login-button {
        background-color: #4a7dff;
    }
    
    .login-button:hover {
        background-color: #3a6ae0;
    }
    
    .logout-button {
        background-color: #e53e3e;
        margin-top: 1rem;
    }
    
    .logout-button:hover {
        background-color: #c53030;
    }
    
    .error {
        color: #e53e3e;
        margin-bottom: 1rem;
        padding: 0.5rem;
        background-color: #fee2e2;
        border-radius: 4px;
        text-align: center;
    }
    
    .test-user-info {
        margin-bottom: 1.5rem;
        padding: 0.75rem;
        background-color: #f0f9ff;
        border: 1px solid #e0f2fe;
        border-radius: 4px;
    }
    
    .test-user-info p {
        margin: 0.25rem 0;
    }
    
    code {
        background-color: #f1f1f1;
        padding: 0.1rem 0.3rem;
        border-radius: 3px;
        font-family: monospace;
    }
    
    .success-message {
        margin-top: 1.5rem;
        padding: 0.75rem;
        background-color: #f0fdf4;
        border: 1px solid #dcfce7;
        border-radius: 4px;
        text-align: center;
    }
    
    .register-link {
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