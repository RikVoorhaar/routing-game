import { describe, test, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';
import { writable } from 'svelte/store';

const pageStore = writable<{ data: { session: unknown } }>({ data: { session: null } });

vi.mock('$app/stores', () => ({
	page: {
		subscribe: pageStore.subscribe
	}
}));

describe('/+page.svelte', () => {
	beforeEach(() => {
		pageStore.set({ data: { session: null } });
	});

	test('should render h1 when not logged in', async () => {
		const { default: Page } = await import('./+page.svelte');
		render(Page);
		expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
		expect(screen.getByText('You are not logged in.')).toBeInTheDocument();
	});

	test('should render welcome message when logged in', async () => {
		pageStore.set({
			data: {
				session: {
					user: {
						name: 'Test User',
						email: 'test@example.com'
					}
				} as unknown
			}
		});
		const { default: Page } = await import('./+page.svelte');
		render(Page);
		expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
		expect(screen.getAllByText((content, node) =>
			!!node?.textContent?.match(/Welcome,?\s*Test User!?/i)
		).length).toBeGreaterThan(0);
		expect(screen.getByText('Go to Protected Page')).toBeInTheDocument();
		expect(screen.getByText('Sign Out')).toBeInTheDocument();
	});
});
