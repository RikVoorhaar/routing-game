import { writable } from 'svelte/store';

export type MainTab = 'map' | 'map_maplibre' | 'employees' | 'levels' | 'upgrades';

export const activeMainTab = writable<MainTab>('map');

export function switchToTab(tab: MainTab) {
	activeMainTab.set(tab);
}
