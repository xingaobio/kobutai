import type { DrawView } from '../gacha/engine';
import type { LoadedPack } from '../pack/types';
import type { RegistryState } from '../registry';

/** Reactive state pushed into the overlay from the content script. */
export const live = $state<{
  registry: RegistryState;
  draw: DrawView | null;
  packs: LoadedPack[];
  fullscreen: boolean;
  hidden: boolean;
}>({
  registry: { primary: null, entries: [] },
  draw: null,
  packs: [],
  fullscreen: false,
  hidden: false,
});

/** The character to show: the drawn one, else the first pack. */
export function currentPack(): LoadedPack | undefined {
  return live.packs.find((p) => p.id === live.draw?.packId) ?? live.packs[0];
}
