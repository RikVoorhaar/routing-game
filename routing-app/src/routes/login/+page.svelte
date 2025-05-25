<script>
    import { page } from '$app/stores';
    
    let error = $page.form?.error || '';
</script>

<div class="login-container">
    <h1>Login</h1>
    
    {#if error}
        <div class="error">{error}</div>
    {/if}
    
    <form method="POST" class="login-form">
        <div class="form-group">
            <label for="username">Username</label>
            <input
                type="text"
                id="username"
                name="username"
                placeholder="Enter your username"
                required
            />
        </div>
        
        <div class="form-group">
            <label for="password">Password</label>
            <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                required
            />
        </div>
        
        <button type="submit" class="login-button">Login</button>
    </form>
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
    
    .login-button {
        width: 100%;
        padding: 0.75rem;
        background-color: #4a7dff;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .login-button:hover {
        background-color: #3a6ae0;
    }
    
    .error {
        color: #e53e3e;
        margin-bottom: 1rem;
        padding: 0.5rem;
        background-color: #fee2e2;
        border-radius: 4px;
        text-align: center;
    }
</style> 