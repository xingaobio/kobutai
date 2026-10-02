import type { RegistryState } from '../registry';

/** Reactive state pushed into the overlay from the content script. */
export const live = $state<{ registry: RegistryState; fullscreen: boolean; hidden: boolean }>({
  registry: { primary: null, entries: [] },
  fullscreen: false,
  hidden: false,
});
