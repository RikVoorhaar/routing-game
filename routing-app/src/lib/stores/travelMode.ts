import { writable, derived, get } from 'svelte/store';
import type { Coordinate, PathPoint } from '$lib/server/db/schema';

export interface TravelRouteResult {
	path: PathPoint[];
	travelTimeSeconds: number;
	totalDistanceMeters: number;
}

export interface TravelModeState {
	isActive: boolean;
	employeeId: string | null;
	destinationCoordinate: Coordinate | null;
	routingStatus: 'idle' | 'loading' | 'success' | 'error';
	routeResult: TravelRouteResult | null;
	activeTravelJobId: string | null; // Set when travel is started
}

const initialState: TravelModeState = {
	isActive: false,
	employeeId: null,
	destinationCoordinate: null,
	routingStatus: 'idle',
	routeResult: null,
	activeTravelJobId: null
};

export const travelModeState = writable<TravelModeState>(initialState);

export const isInTravelMode = derived(travelModeState, ($state) => $state.isActive);

export const travelModeActions = {
	enterTravelMode(employeeId: string) {
		travelModeState.update((state) => ({
			...state,
			isActive: true,
			employeeId,
			destinationCoordinate: null,
			routingStatus: 'idle',
			routeResult: null,
			activeTravelJobId: null
		}));
	},

	exitTravelMode() {
		travelModeState.set(initialState);
	},

	setDestination(coord: Coordinate) {
		travelModeState.update((state) => ({
			...state,
			destinationCoordinate: coord,
			routingStatus: 'loading',
			routeResult: null
		}));
	},

	setRouteResult(result: TravelRouteResult | null) {
		travelModeState.update((state) => ({
			...state,
			routingStatus: result ? 'success' : 'error',
			routeResult: result
		}));
	},

	startTravel(travelJobId: string) {
		travelModeState.update((state) => ({
			...state,
			activeTravelJobId: travelJobId,
			isActive: false // Exit travel mode when travel starts
		}));
	},

	completeTravel() {
		travelModeState.set(initialState);
	}
};
