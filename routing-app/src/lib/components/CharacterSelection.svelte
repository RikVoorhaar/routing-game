<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import CharacterCard from './CharacterCard.svelte';
    
    export let gameStates: Array<{
        id: string;
        name: string;
        money: number;
        routeLevel: number;
        createdAt: number;
        userId: string;
    }>;
    
    let showCreateModal = false;
    let newCharacterName = '';
    let isCreating = false;
    let createError = '';
    
    // Reactive statement to update gameStates when page data changes
    $: gameStates = $page.data.gameStates ?? gameStates;
    
    async function handleCreateCharacter() {
        if (!newCharacterName.trim()) {
            createError = 'Character name is required';
            return;
        }
        
        isCreating = true;
        createError = '';
        
        try {
            const response = await fetch('/api/game-states', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newCharacterName.trim() })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to create character');
            }
            
            const newCharacter = await response.json();
            gameStates = [...gameStates, newCharacter];
            
            // Reset form
            newCharacterName = '';
            showCreateModal = false;
        } catch (error) {
            console.error('Error creating character:', error);
            createError = error instanceof Error ? error.message : 'Failed to create character';
        } finally {
            isCreating = false;
        }
    }
    
    async function handleDeleteCharacter(event: CustomEvent<{id: string; name: string}>) {
        const { id } = event.detail;
        
        try {
            const response = await fetch('/api/game-states', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameStateId: id })
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete character');
            }
            
            // Remove the character from the list
            gameStates = gameStates.filter(character => character.id !== id);
        } catch (error) {
            console.error('Error deleting character:', error);
            // You might want to show a toast notification here
        }
    }
    
    function handleSelectCharacter(event: CustomEvent<{id: string; name: string}>) {
        const { id } = event.detail;
        // Navigate to the game with the selected character
        goto(`/game/${id}`);
    }
    
    function handleCreateModalOpen() {
        showCreateModal = true;
        createError = '';
        newCharacterName = '';
    }
    
    function handleCreateModalClose() {
        showCreateModal = false;
        createError = '';
        newCharacterName = '';
    }
</script>

<div class="container mx-auto px-4 py-8">
    <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-primary mb-4">Select Your Character</h1>
        <p class="text-lg text-base-content/70">Choose a character to continue your routing adventure</p>
    </div>
    
    {#if gameStates.length === 0}
        <div class="text-center py-16">
            <div class="mb-8">
                <svg class="w-24 h-24 mx-auto text-base-content/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                    </path>
                </svg>
            </div>
            <h2 class="text-2xl font-bold mb-4">No Characters Yet</h2>
            <p class="text-base-content/70 mb-8">Create your first character to start playing the routing game!</p>
            <button 
                class="btn btn-primary btn-lg"
                on:click={handleCreateModalOpen}
            >
                Create Your First Character
            </button>
        </div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {#each gameStates as character (character.id)}
                <CharacterCard 
                    {character} 
                    on:delete={handleDeleteCharacter}
                    on:select={handleSelectCharacter}
                />
            {/each}
        </div>
        
        <div class="text-center">
            <button 
                class="btn btn-outline btn-primary btn-lg"
                on:click={handleCreateModalOpen}
            >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
                Create New Character
            </button>
        </div>
    {/if}
</div>

<!-- Create Character Modal -->
{#if showCreateModal}
    <div class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Create New Character</h3>
            
            <div class="form-control">
                <label class="label" for="character-name">
                    <span class="label-text">Character Name</span>
                </label>
                <input 
                    id="character-name"
                    type="text" 
                    placeholder="Enter character name"
                    class="input input-bordered w-full"
                    class:input-error={createError}
                    bind:value={newCharacterName}
                    disabled={isCreating}
                    on:keydown={(e) => e.key === 'Enter' && handleCreateCharacter()}
                />
                {#if createError}
                    <div class="label">
                        <span class="label-text-alt text-error">{createError}</span>
                    </div>
                {/if}
            </div>
            
            <div class="modal-action">
                <button 
                    class="btn btn-ghost"
                    on:click={handleCreateModalClose}
                    disabled={isCreating}
                >
                    Cancel
                </button>
                <button 
                    class="btn btn-primary"
                    on:click={handleCreateCharacter}
                    disabled={isCreating || !newCharacterName.trim()}
                >
                    {#if isCreating}
                        <span class="loading loading-spinner loading-xs"></span>
                        Creating...
                    {:else}
                        Create Character
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if} 