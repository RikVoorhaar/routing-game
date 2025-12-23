<script lang="ts">
	import { gameDataAPI } from '$lib/stores/gameData';
	import { cheatSettings, cheatActions } from '$lib/stores/cheats';
	import { log } from '$lib/logger';
	import { onMount } from 'svelte';

	let moneyAmount = 0;
	let isProcessing = false;
	let error = '';

	// State for route completion cheat
	let isCompletingRoutes = false;
	let completeRoutesError = '';

	// State for route regeneration cheat

	// Debug controls state
	let currentLogLevel = 3;

	onMount(() => {
		currentLogLevel = log.getLevel();
	});

	function setLogLevel(level: number) {
		log.setLevel(level);
		currentLogLevel = level;
		log.info(`Log level changed to: ${getLevelName(level)}`);
	}

	function getLevelName(level: number): string {
		switch (level) {
			case 0:
				return 'Silent';
			case 1:
				return 'Error';
			case 2:
				return 'Warn';
			case 3:
				return 'Info';
			case 4:
				return 'Debug';
			case 5:
				return 'Trace';
			default:
				return 'Unknown';
		}
	}

	function toggleDebug() {
		if (currentLogLevel >= 4) {
			log.disableDebug();
			currentLogLevel = log.getLevel();
		} else {
			log.enableDebug();
			currentLogLevel = log.getLevel();
		}
	}

	async function handleAddMoney() {
		if (isProcessing || moneyAmount === 0) return;

		isProcessing = true;
		error = '';

		try {
			await gameDataAPI.addMoney(moneyAmount);

			// Reset the input on success
			moneyAmount = 0;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add money';
		} finally {
			isProcessing = false;
		}
	}

	async function handleCompleteAllRoutes() {
		if (isCompletingRoutes) return;

		log.debug('[CHEAT COMPONENT] Starting handleCompleteAllRoutes');
		isCompletingRoutes = true;
		completeRoutesError = '';

		try {
			log.debug('[CHEAT COMPONENT] Calling gameDataAPI.completeAllRoutes()');
			const result = await gameDataAPI.completeAllRoutes();

			// Show success message or handle result
			log.debug('[CHEAT COMPONENT] Routes completed successfully:', result);
		} catch (err) {
			log.error('[CHEAT COMPONENT] Error in handleCompleteAllRoutes:', err);
			completeRoutesError = err instanceof Error ? err.message : 'Failed to complete routes';
		} finally {
			log.debug('[CHEAT COMPONENT] Finishing handleCompleteAllRoutes');
			isCompletingRoutes = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleAddMoney();
		}
	}
</script>

<div class="space-y-4">
	<!-- Add Money Cheat -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">💰 Add Money</span>
		</div>
		<div class="input-group">
			<span class="bg-base-300">€</span>
			<input
				type="number"
				placeholder="Enter amount (negative to subtract)"
				class="input input-sm input-bordered flex-1"
				class:input-error={error}
				bind:value={moneyAmount}
				disabled={isProcessing}
				on:keydown={handleKeyDown}
			/>
			<button
				class="btn btn-square btn-primary btn-sm"
				disabled={isProcessing || moneyAmount === 0}
				on:click={handleAddMoney}
			>
				{#if isProcessing}
					<span class="loading loading-spinner loading-xs"></span>
				{:else}
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 6v6m0 0v6m0-6h6m-6 0H6"
						/>
					</svg>
				{/if}
			</button>
		</div>
		{#if error}
			<div class="label">
				<span class="label-text-alt text-error">{error}</span>
			</div>
		{/if}
	</div>

	<!-- Complete All Routes Cheat -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">🏁 Complete All Routes</span>
		</div>
		<button
			class="btn btn-secondary btn-sm w-full"
			disabled={isCompletingRoutes}
			on:click={handleCompleteAllRoutes}
		>
			{#if isCompletingRoutes}
				<span class="loading loading-spinner loading-xs"></span>
				Completing Routes...
			{:else}
				<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
				Complete All Active Routes
			{/if}
		</button>
		{#if completeRoutesError}
			<div class="label">
				<span class="label-text-alt text-error">{completeRoutesError}</span>
			</div>
		{/if}
	</div>

	<!-- Tile Debug Toggle -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">🗺️ Tile Debug</span>
		</div>
		<div class="form-control">
			<label class="label cursor-pointer">
				<span class="label-text">Show active map tiles</span>
				<input
					type="checkbox"
					class="toggle toggle-primary"
					bind:checked={$cheatSettings.showTileDebug}
				/>
			</label>
		</div>
	</div>

	<!-- Debug Log Level Controls -->
	<div class="form-control">
		<div class="label">
			<span class="label-text">🐛 Debug Logging</span>
		</div>

		<!-- Quick Debug Toggle -->
		<div class="form-control mb-2">
			<label class="label cursor-pointer">
				<span class="label-text text-sm">Enable debug logs</span>
				<input
					type="checkbox"
					class="toggle toggle-secondary toggle-sm"
					checked={currentLogLevel >= 4}
					on:change={toggleDebug}
				/>
			</label>
		</div>

		<!-- Detailed Log Level Control -->
		<div class="form-control">
			<label class="label">
				<span class="label-text text-xs">Log Level ({getLevelName(currentLogLevel)})</span>
			</label>
			<select
				class="select select-bordered select-xs"
				bind:value={currentLogLevel}
				on:change={(e) => {
					const target = e.target as HTMLSelectElement;
					setLogLevel(parseInt(target.value));
				}}
			>
				<option value={0}>Silent (0)</option>
				<option value={1}>Error (1)</option>
				<option value={2}>Warn (2)</option>
				<option value={3}>Info (3)</option>
				<option value={4}>Debug (4)</option>
				<option value={5}>Trace (5)</option>
			</select>
		</div>

		<div class="mt-2 rounded bg-base-300 p-2 text-xs text-base-content/70">
			<strong>Current:</strong>
			{getLevelName(currentLogLevel)}<br />
			<strong>Tip:</strong> Debug level shows all the detailed logs that were previously flooding the
			console
		</div>
	</div>
</div>
