<script>
    import { page } from '$app/stores';
    import { signOut } from '@auth/sveltekit/client';
</script>

<div class="protected-container">
    <h1>Protected Page</h1>
    
    {#if $page.data.session && $page.data.session.user}
        <div class="user-info">
            <p>Welcome, <strong>{$page.data.session.user.name || $page.data.session.user.email || 'User'}</strong>!</p>
            <p>You are now viewing a protected page that requires authentication.</p>
        </div>
        
        <button class="logout-button" on:click={() => signOut({ callbackUrl: '/' })}>
            Sign Out
        </button>
    {:else}
        <p>Loading user data...</p>
    {/if}
</div>

<style>
    .protected-container {
        max-width: 600px;
        margin: 100px auto 0;
        padding: 2rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        background: white;
    }
    
    h1 {
        text-align: center;
        color: #333;
        margin-bottom: 1.5rem;
    }
    
    .user-info {
        margin-bottom: 2rem;
    }
    
    .logout-button {
        padding: 0.75rem 1.5rem;
        background-color: #e53e3e;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
    }
    
    .logout-button:hover {
        background-color: #c53030;
    }
</style> 