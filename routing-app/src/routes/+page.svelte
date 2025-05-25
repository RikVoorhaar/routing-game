<script>
    import { page } from '$app/stores';
    import { signOut } from '@auth/sveltekit/client';
</script>

<main>
    <h1>Routing App</h1>
    
    <div class="auth-status">
        {#if $page.data.session}
            <p>
                Welcome, <strong>{$page.data.session.user?.name || $page.data.session.user?.email || 'User'}</strong>!
            </p>
            <div class="button-group">
                <a href="/protected" class="button">Go to Protected Page</a>
                <button class="button logout" on:click={() => signOut({ callbackUrl: '/' })}>
                    Sign Out
                </button>
            </div>
        {:else}
            <p>You are not logged in.</p>
            <a href="/login" class="button">Login</a>
        {/if}
    </div>
</main>

<style>
    main {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
    }
    
    h1 {
        font-size: 2.5rem;
        margin-bottom: 2rem;
        color: #333;
    }
    
    .auth-status {
        padding: 2rem;
        background-color: #f9f9f9;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .button-group {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin-top: 1rem;
    }
    
    .button {
        display: inline-block;
        padding: 0.75rem 1.5rem;
        background-color: #4a7dff;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
        border: none;
    }
    
    .button:hover {
        background-color: #3a6ae0;
    }
    
    .logout {
        background-color: #e53e3e;
    }
    
    .logout:hover {
        background-color: #c53030;
    }
</style>
