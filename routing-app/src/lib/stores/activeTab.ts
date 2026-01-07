import { writable } from 'svelte/store';

export type MainTab = 'map' | 'employees' | 'levels' | 'upgrades';

export const activeMainTab = writable<MainTab>('map');

export function switchToTab(tab: MainTab) {
	activeMainTab.set(tab);
}
