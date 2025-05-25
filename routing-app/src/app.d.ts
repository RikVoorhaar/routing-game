// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			auth(): Promise<import('@auth/core').Session | null>;
		}
		interface PageData {
			session: import('@auth/core').Session | null;
		}
		// interface Platform {}
	}
}

/// <reference types="@auth/sveltekit" />
export {};
