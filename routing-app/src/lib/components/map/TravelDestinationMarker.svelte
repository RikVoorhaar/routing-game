<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { travelModeState, travelModeActions } from '$lib/stores/travelMode';
	import { fullEmployeeData } from '$lib/stores/gameData';
	import {
		createTravelDestinationPopupHTML,
		TRAVEL_DESTINATION_GO_BUTTON_ID,
		TRAVEL_DESTINATION_CANCEL_BUTTON_ID
	} from './popups/travelDestinationPopup';
	import type { Coordinate } from '$lib/server/db/schema';

	export let map: any;
	export let L: any;

	let destinationMarker: any = null;
	let routePreviewPolyline: any = null;

	$: if (map && L) {
		const state = $travelModeState;

		// Check if employee already has an active travel job
		const employeeData = $fullEmployeeData.find((fed) => fed.employee.id === state.employeeId);
		const hasActiveTravelJob =
			employeeData?.travelJob?.startTime || state.activeTravelJobId !== null;

		// Clear existing marker and polyline
		if (destinationMarker) {
			map.removeLayer(destinationMarker);
			destinationMarker = null;
		}
		if (routePreviewPolyline) {
			map.removeLayer(routePreviewPolyline);
			routePreviewPolyline = null;
		}

		// Only show marker if we have a destination coordinate and travel hasn't started
		if (state.destinationCoordinate && !hasActiveTravelJob && state.isActive) {
			const { lat, lon } = state.destinationCoordinate;

			if (state.routingStatus === 'success' && state.routeResult) {
				// Green marker with popup
				const greenIcon = L.divIcon({
					html: `
					<div style="
						width: 24px;
						height: 24px;
						background: #10b981;
						border-radius: 50%;
						border: 2px solid white;
						box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					"></div>
				`,
					className: 'travel-destination-marker',
					iconSize: [24, 24],
					iconAnchor: [12, 12]
				});

				destinationMarker = L.marker([lat, lon], { icon: greenIcon }).addTo(map);

				// Create popup with route info
				const popupContent = createTravelDestinationPopupHTML(state.routeResult);
				const popup = L.popup({
					maxWidth: 250,
					className: 'travel-destination-popup'
				}).setContent(popupContent);

				destinationMarker.bindPopup(popup);

				// Set up button handlers - do this before opening popup
				const setupButtonHandlers = () => {
					const goButton = document.getElementById(TRAVEL_DESTINATION_GO_BUTTON_ID);
					const cancelButton = document.getElementById(TRAVEL_DESTINATION_CANCEL_BUTTON_ID);

					if (goButton) {
						goButton.onclick = async () => {
							// Call travel start API
							const currentState = get(travelModeState);
							if (!currentState.routeResult || !currentState.employeeId) {
								return;
							}

							// Check if travel job already exists (prevent double-click)
							const currentEmployeeData = $fullEmployeeData.find(
								(fed) => fed.employee.id === currentState.employeeId
							);
							if (currentEmployeeData?.travelJob?.startTime) {
								destinationMarker.closePopup();
								return;
							}

							const { currentGameState, gameDataAPI } = await import('$lib/stores/gameData');
							const gameState = get(currentGameState);
							if (!gameState) {
								return;
							}

							try {
								const employee = await gameDataAPI.refreshEmployee(currentState.employeeId);
								let employeeLocation: Coordinate;
								if (typeof employee.location === 'string') {
									employeeLocation = JSON.parse(employee.location);
								} else {
									employeeLocation = employee.location as Coordinate;
								}

								const response = await fetch('/api/travel/start', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({
										employeeId: currentState.employeeId,
										gameStateId: gameState.id,
										destinationCoordinate: currentState.destinationCoordinate,
										routePath: currentState.routeResult.path,
										durationSeconds: currentState.routeResult.travelTimeSeconds
									})
								});

								if (response.ok) {
									const { travelJob } = await response.json();
									travelModeActions.startTravel(travelJob.id);
									destinationMarker.closePopup();
									// Update gameData store immediately with travel job
									const { gameDataActions } = await import('$lib/stores/gameData');
									gameDataActions.setEmployeeTravelJob(currentState.employeeId, travelJob);
									// Refresh employee data to ensure everything is in sync
									await gameDataAPI.loadAllEmployeeData();
									// Exit travel mode and remove marker after travel starts
									travelModeActions.exitTravelMode();
								} else {
									const errorData = await response.json();
									const { addError } = await import('$lib/stores/errors');
									addError(errorData.message || 'Failed to start travel', 'error');
								}
							} catch (error) {
								console.error('Error starting travel:', error);
								const { addError } = await import('$lib/stores/errors');
								addError('Failed to start travel', 'error');
							}
						};
					}

					if (cancelButton) {
						cancelButton.onclick = () => {
							travelModeActions.exitTravelMode();
							destinationMarker.closePopup();
						};
					}
				};

				// Set up handlers when popup opens
				destinationMarker.on('popupopen', () => {
					setTimeout(setupButtonHandlers, 10);
				});

				// Immediately open the popup when marker is created
				// Use setTimeout to ensure popup is fully initialized before opening
				setTimeout(() => {
					destinationMarker.openPopup();
					// Also set up handlers immediately in case popupopen event doesn't fire
					setTimeout(setupButtonHandlers, 50);
				}, 50);

				// Draw route preview polyline (orange/amber)
				if (state.routeResult.path && state.routeResult.path.length > 0) {
					const routeCoords = state.routeResult.path.map((point) => [
						point.coordinates.lat,
						point.coordinates.lon
					]);
					routePreviewPolyline = L.polyline(routeCoords, {
						color: '#f59e0b', // Orange/amber color
						weight: 4,
						opacity: 0.7,
						dashArray: '10, 5'
					}).addTo(map);
				}
			} else if (state.routingStatus === 'error') {
				// Red marker without popup
				const redIcon = L.divIcon({
					html: `
					<div style="
						width: 24px;
						height: 24px;
						background: #ef4444;
						border-radius: 50%;
						border: 2px solid white;
						box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					"></div>
				`,
					className: 'travel-destination-marker',
					iconSize: [24, 24],
					iconAnchor: [12, 12]
				});

				destinationMarker = L.marker([lat, lon], { icon: redIcon }).addTo(map);
			}
		}
	}

	onDestroy(() => {
		if (destinationMarker && map.hasLayer(destinationMarker)) {
			map.removeLayer(destinationMarker);
		}
		if (routePreviewPolyline && map.hasLayer(routePreviewPolyline)) {
			map.removeLayer(routePreviewPolyline);
		}
	});
</script>
