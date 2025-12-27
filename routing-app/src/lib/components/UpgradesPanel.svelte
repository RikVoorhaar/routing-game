<script lang="ts">
	import { currentGameState, gameDataActions } from '$lib/stores/gameData';
	import { addError } from '$lib/stores/errors';
	import { UPGRADE_DEFINITIONS } from '$lib/upgrades/upgradeDefinitions';
	import { checkLevelRequirements, checkUpgradeRequirements } from '$lib/upgrades/upgradeUtils';
	import { formatMoney } from '$lib/formatting';
	import { CATEGORY_NAMES, JobCategory } from '$lib/jobs/jobCategories';
	import type { UpgradeConfig } from '$lib/config/types';
	import type { GameState } from '$lib/server/db/schema';

	let isPurchasing = false;
	let purchasingUpgradeId: string | null = null;

	// Filter upgrades: show only available and locked (hide purchased)
	$: purchasedUpgradeIds = new Set($currentGameState?.upgradesPurchased || []);
	$: availableUpgrades = UPGRADE_DEFINITIONS.filter(
		(upgrade) => !purchasedUpgradeIds.has(upgrade.id)
	);

	// Check requirements for each upgrade
	function getUpgradeStatus(upgrade: UpgradeConfig, gameState: GameState) {
		const purchased = gameState.upgradesPurchased || [];

		// Check upgrade dependencies
		const dependenciesMet = checkUpgradeRequirements(purchased, upgrade.upgradeRequirements);
		const missingDependencies = upgrade.upgradeRequirements.filter((id) => !purchased.includes(id));

		// Check level requirements
		const levelsMet = checkLevelRequirements(gameState, upgrade.levelRequirements);

		// Check sufficient money
		const hasEnoughMoney = gameState.money >= upgrade.cost;

		// Upgrade is available if all requirements except possibly money are met
		const requirementsMet = dependenciesMet && levelsMet;
		const canPurchase = requirementsMet && hasEnoughMoney;

		return {
			dependenciesMet,
			missingDependencies,
			levelsMet,
			hasEnoughMoney,
			requirementsMet,
			canPurchase
		};
	}

	$: upgradesWithStatus = availableUpgrades
		.map((upgrade) => {
			if (!$currentGameState) {
				return {
					upgrade,
					status: {
						dependenciesMet: false,
						missingDependencies: upgrade.upgradeRequirements,
						levelsMet: false,
						hasEnoughMoney: false,
						requirementsMet: false,
						canPurchase: false
					}
				};
			}
			return {
				upgrade,
				status: getUpgradeStatus(upgrade, $currentGameState)
			};
		})
		// Filter: only show upgrades where dependencies are met
		// (hide upgrades with missing dependencies, but show those with unmet level requirements or insufficient funds)
		.filter(({ status }) => status.dependenciesMet)
		// Sort: upgrades with all requirements met (canPurchase) first, then those with requirements met but insufficient funds,
		// then those with unmet level requirements
		.sort((a, b) => {
			// Priority 1: Can purchase (all requirements met + enough money)
			if (a.status.canPurchase && !b.status.canPurchase) return -1;
			if (!a.status.canPurchase && b.status.canPurchase) return 1;
			// Priority 2: Requirements met but insufficient funds
			if (a.status.requirementsMet && !b.status.requirementsMet) return -1;
			if (!a.status.requirementsMet && b.status.requirementsMet) return 1;
			// Priority 3: Sort by cost (cheaper first) for same priority level
			return a.upgrade.cost - b.upgrade.cost;
		});

	async function handlePurchase(upgradeId: string) {
		if (!$currentGameState || isPurchasing) return;

		isPurchasing = true;
		purchasingUpgradeId = upgradeId;

		try {
			const response = await fetch('/api/upgrades/purchase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameStateId: $currentGameState.id,
					upgradeId
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to purchase upgrade');
			}

			const updatedGameState = await response.json();

			// Update game state store
			gameDataActions.setGameState(updatedGameState);

			addError(
				`Upgrade purchased: ${UPGRADE_DEFINITIONS.find((u) => u.id === upgradeId)?.name}`,
				'info'
			);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to purchase upgrade';
			addError(errorMessage, 'error');
		} finally {
			isPurchasing = false;
			purchasingUpgradeId = null;
		}
	}

	function formatLevelRequirements(requirements: UpgradeConfig['levelRequirements']): string {
		const parts: string[] = [];
		if (requirements.total !== undefined) {
			parts.push(`Total Level ${requirements.total}`);
		}
		// Add category requirements if any (using enum keys like "FURNITURE", "PEOPLE", etc.)
		for (const [key, level] of Object.entries(requirements)) {
			if (key !== 'total' && level !== undefined) {
				// Look up category name from enum key
				const categoryNum = JobCategory[key as keyof typeof JobCategory];
				const categoryName = categoryNum !== undefined ? CATEGORY_NAMES[categoryNum] : key;
				parts.push(`${categoryName} Level ${level}`);
			}
		}
		return parts.length > 0 ? parts.join(', ') : 'None';
	}
</script>

<div class="space-y-4">
	{#if upgradesWithStatus.length === 0}
		<div class="card bg-base-100 shadow">
			<div class="card-body p-8 text-center">
				<div class="mb-4 text-6xl">🎉</div>
				<h3 class="mb-2 text-xl font-bold">All Upgrades Purchased!</h3>
				<p class="text-base-content/70">You've unlocked all available upgrades.</p>
			</div>
		</div>
	{:else}
		<div class="max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				{#each upgradesWithStatus as { upgrade, status } (upgrade.id)}
				{@const isLocked = !status.requirementsMet}
				<div
					class="card bg-base-100 shadow"
					class:opacity-50={isLocked}
					class:pointer-events-none={isLocked && !isPurchasing}
				>
					<div class="card-body p-4">
						<h3 class="card-title text-lg">{upgrade.name}</h3>
						<p class="mb-3 text-sm text-base-content/70">{upgrade.description}</p>

						<div class="mb-3 space-y-1 text-xs">
							<div>
								<span class="font-semibold">Cost:</span>{' '}
								<span
									class:text-error={!status.hasEnoughMoney && status.requirementsMet}
									class:text-success={status.hasEnoughMoney && status.requirementsMet}
								>
									{formatMoney(upgrade.cost)}
								</span>
								{#if !status.hasEnoughMoney && status.requirementsMet}
									<span class="ml-1 text-error">(Insufficient funds)</span>
								{/if}
							</div>
							{#if upgrade.levelRequirements.total !== undefined || Object.keys(upgrade.levelRequirements).some((k) => k !== 'total')}
								<div>
									<span class="font-semibold">Requirements:</span>{' '}
									<span class:text-error={!status.levelsMet} class:text-success={status.levelsMet}>
										{formatLevelRequirements(upgrade.levelRequirements)}
									</span>
								</div>
							{/if}
							{#if upgrade.upgradeRequirements.length > 0}
								<div>
									<span class="font-semibold">Dependencies:</span>
									<div class="ml-4 mt-1 space-y-0.5">
										{#each upgrade.upgradeRequirements as depId (depId)}
											{@const depName =
												UPGRADE_DEFINITIONS.find((u) => u.id === depId)?.name || depId}
											{@const depMet = ($currentGameState?.upgradesPurchased || []).includes(depId)}
											<div class:text-success={depMet} class:text-error={!depMet}>
												• {depName}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>

						<div class="card-actions justify-end">
							<button
								class="btn btn-primary btn-sm"
								disabled={!status.canPurchase || isPurchasing}
								on:click={() => handlePurchase(upgrade.id)}
							>
								{#if isPurchasing && purchasingUpgradeId === upgrade.id}
									<span class="loading loading-spinner loading-xs"></span>
									Purchasing...
								{:else if status.canPurchase}
									Purchase ({formatMoney(upgrade.cost)})
								{:else if status.requirementsMet && !status.hasEnoughMoney}
									Insufficient Funds
								{:else}
									Locked
				{/if}
			</button>
						</div>
					</div>
				</div>
			{/each}
			</div>
		</div>
	{/if}
</div>
