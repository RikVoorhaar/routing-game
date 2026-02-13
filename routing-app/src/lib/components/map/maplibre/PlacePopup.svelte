<script lang="ts">
	import { onMount } from 'svelte';
	import type { Place } from '$lib/stores/placesCache';
	import { placeGoods } from '$lib/stores/placeGoods';
	import { currentGameState, fullEmployeeData } from '$lib/stores/gameData';
	import { selectedEmployee } from '$lib/stores/selectedEmployee';
	import { selectPlaceGoods } from '$lib/places/placeGoodsSelection';
	import { generateSupplyAmount } from '$lib/places/supplyAmount';
	import { computeCompleteJobValue } from '$lib/jobs/jobValue';
	import { computeJobXp } from '$lib/jobs/jobUtils';
	import { mapGoodToCategory } from '$lib/jobs/goodToCategory';
	import { getVehicleConfig } from '$lib/vehicles/vehicleUtils';
	import { config } from '$lib/stores/config';
	import { get } from 'svelte/store';
	import { log } from '$lib/logger';
	import type { PlaceGoodsConfig } from '$lib/config/placeGoodsTypes';

	export let place: Place;
	export let popupPixelPosition: { x: number; y: number } | null;
	export let onClose: () => void;
	export let zoom: number = 13;

	let selectedGoods: { type: 'supply' | 'demand'; good: string } | null = null;
	let supplyAmount: number | null = null;
	let vehicleCapacity: number | null = null;
	let jobValue: number | null = null;
	let routeDuration: number | null = null;
	let jobXp: number | null = null;
	let isLoadingRoute = false;
	let placeGoodsConfig: PlaceGoodsConfig | null = null;

	// Format duration helper
	function formatDuration(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		if (minutes > 0) {
			return `${minutes}m ${secs}s`;
		}
		return `${secs}s`;
	}

	// Get employee position helper
	function getEmployeePosition(employee: any): { lat: number; lon: number } | null {
		if (!employee?.location) return null;
		try {
			let locationData: any;
			if (typeof employee.location === 'string') {
				locationData = JSON.parse(employee.location);
			} else if (typeof employee.location === 'object') {
				locationData = employee.location;
			} else {
				return null;
			}
			return { lat: locationData.lat, lon: locationData.lon };
		} catch (e) {
			log.warn('[PlacePopup] Invalid location data:', e);
			return null;
		}
	}

	// Compute route from employee to demand place
	async function computeEmployeeToDemandRoute(): Promise<void> {
		const employeeId = get(selectedEmployee);
		const gameState = get(currentGameState);
		const employeeData = employeeId
			? get(fullEmployeeData).find((fed) => fed.employee.id === employeeId)
			: null;

		if (!employeeId || !employeeData || !gameState) {
			return;
		}

		const employeeLocation = getEmployeePosition(employeeData.employee);
		if (!employeeLocation) {
			return;
		}

		isLoadingRoute = true;
		try {
			const response = await fetch(
				`/api/travel/route?employeeId=${employeeId}&fromLat=${employeeLocation.lat}&fromLon=${employeeLocation.lon}&toLat=${place.lat}&toLon=${place.lon}`
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				log.error(
					`[PlacePopup] Failed to compute route: ${response.status} ${errorData.error || 'Unknown error'}`
				);
				isLoadingRoute = false;
				return;
			}

			const data = await response.json();

			if (!data.success || !data.path || data.path.length === 0) {
				log.warn(`[PlacePopup] Route computation failed: ${data.error || 'No path returned'}`);
				isLoadingRoute = false;
				return;
			}

			routeDuration = data.travelTimeSeconds;

			// Compute job value and XP if we have supply amount
			if (supplyAmount !== null && vehicleCapacity !== null && placeGoodsConfig) {
				const goodValue = placeGoodsConfig.goods?.[selectedGoods?.good ?? '']?.value_per_kg ?? 0;
				const currentConfigStore = get(config);
				if (goodValue > 0 && currentConfigStore) {
					jobValue = computeCompleteJobValue(
						goodValue,
						supplyAmount,
						vehicleCapacity,
						gameState.seed,
						place.id,
						gameState,
						currentConfigStore.jobs.value.randomFactorMax
					);

					// Compute XP from route duration
					const vehicleConfig = getVehicleConfig(employeeData.employee.vehicleLevel);
					const employeeMaxSpeed = vehicleConfig?.roadSpeed ?? 50;
					const averageSpeedKmh = employeeMaxSpeed * 0.6;
					const estimatedDistanceKm = (data.travelTimeSeconds * averageSpeedKmh) / 3600;
					const jobCategory = mapGoodToCategory(selectedGoods?.good ?? '');
					jobXp = computeJobXp(
						{ totalDistanceKm: estimatedDistanceKm, jobCategory } as any,
						currentConfigStore,
						gameState
					);
				}
			}
		} catch (error) {
			log.error('[PlacePopup] Error computing route:', error);
		} finally {
			isLoadingRoute = false;
		}
	}

	// Load place goods config and compute place data
	onMount(async () => {
		try {
			await placeGoods.load();
			placeGoodsConfig = get(placeGoods);
		} catch (error) {
			log.error('[PlacePopup] Failed to load place goods config:', error);
		}

		const gameState = get(currentGameState);
		const employeeId = get(selectedEmployee);
		const employeeData = employeeId
			? get(fullEmployeeData).find((fed) => fed.employee.id === employeeId)
			: null;

		if (!gameState?.seed || !placeGoodsConfig) {
			return;
		}

		// Find category goods config
		const categoryGoods = placeGoodsConfig.categories.find((cat) => cat.name === place.category);
		if (!categoryGoods) {
			return;
		}

		// Compute selected goods
		selectedGoods = selectPlaceGoods(gameState.seed, place.id, categoryGoods);

		// Compute supply amount for supply nodes
		if (selectedGoods.type === 'supply') {
			supplyAmount = generateSupplyAmount(gameState.seed, place.id, categoryGoods);

			// Get vehicle capacity if employee is selected
			if (employeeData) {
				const vehicleConfig = getVehicleConfig(employeeData.employee.vehicleLevel);
				vehicleCapacity = vehicleConfig?.capacity ?? null;

				// Compute job value estimate
				const goodValue = placeGoodsConfig.goods?.[selectedGoods.good]?.value_per_kg ?? 0;
				const currentConfigStore = get(config);
				if (goodValue > 0 && vehicleCapacity !== null && currentConfigStore) {
					jobValue = computeCompleteJobValue(
						goodValue,
						supplyAmount,
						vehicleCapacity,
						gameState.seed,
						place.id,
						gameState,
						currentConfigStore.jobs.value.randomFactorMax
					);
				}
			}
		} else if (selectedGoods.type === 'demand') {
			// For demand nodes, compute route from employee to demand place
			if (employeeData) {
				const vehicleConfig = getVehicleConfig(employeeData.employee.vehicleLevel);
				vehicleCapacity = vehicleConfig?.capacity ?? null;
				await computeEmployeeToDemandRoute();
			}
		}
	});

	// Reactive: Update route when employee changes
	$: {
		const employeeId = get(selectedEmployee);
		if (
			employeeId &&
			selectedGoods?.type === 'demand' &&
			!isLoadingRoute &&
			routeDuration === null
		) {
			computeEmployeeToDemandRoute();
		}
	}

	// Calculate popup scale based on zoom level
	// Scale from 0.66 at zoom 12 to 1.0 at zoom 16+
	$: popupScale = zoom <= 12 ? 0.66 : zoom >= 16 ? 1.0 : 0.66 + ((zoom - 12) / 4) * 0.34;
</script>

{#if popupPixelPosition}
	<div
		class="absolute z-50 min-w-[200px] max-w-[300px] rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
		style="left: {popupPixelPosition.x}px; top: {popupPixelPosition.y -
			10}px; transform: translate(-50%, -100%) scale({popupScale}); transform-origin: center bottom;"
		role="dialog"
		aria-label="Place information"
	>
		<!-- Close button -->
		<button
			class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2"
			on:click={onClose}
			aria-label="Close popup"
		>
			✕
		</button>

		<!-- Place category header -->
		<div class="mb-3 pr-6 text-base font-semibold">
			{place.category}
		</div>

		<!-- Content grid -->
		<div class="space-y-2 text-sm">
			{#if place.region}
				<div>
					<div class="mb-0.5 text-xs text-base-content/60">Region</div>
					<div class="font-medium">{place.region}</div>
				</div>
			{/if}

			{#if selectedGoods}
				<div>
					<div class="mb-0.5 text-xs text-base-content/60">Type</div>
					<div class="font-medium">
						{selectedGoods.type === 'supply' ? 'Supply' : 'Demand'}: {selectedGoods.good}
					</div>
				</div>
			{/if}

			{#if selectedGoods?.type === 'supply' && supplyAmount !== null}
				<div>
					<div class="mb-0.5 text-xs text-base-content/60">Supply Amount</div>
					<div class="font-medium">{supplyAmount.toFixed(1)} kg</div>
				</div>
			{/if}

			{#if selectedGoods?.type === 'demand'}
				{#if jobXp !== null}
					<div>
						<div class="mb-0.5 text-xs text-base-content/60">XP</div>
						<div class="font-medium">{jobXp}</div>
					</div>
				{/if}

				{#if jobValue !== null}
					<div>
						<div class="mb-0.5 text-xs text-base-content/60">Job Value</div>
						<div class="font-medium text-success">€{jobValue.toFixed(2)}</div>
					</div>
				{/if}

				<div>
					<div class="mb-0.5 text-xs text-base-content/60">Duration</div>
					<div class="font-medium">
						{#if isLoadingRoute}
							<span class="loading loading-spinner loading-xs"></span> Computing...
						{:else if routeDuration !== null}
							{formatDuration(routeDuration)}
						{:else}
							—
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
