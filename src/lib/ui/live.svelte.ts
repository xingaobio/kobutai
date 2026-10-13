import type { DrawView } from '../gacha/engine';
import type { LoadedPack } from '../pack/types';
import type { RegistryState } from '../registry';
import type { ShowWhen } from './presence';
import type { EncoreRate } from '../emoji/encore';
import type { BubbleStyle } from '../emoji/kaomoji';

/** Reactive state pushed into the overlay from the content script. */
export const live = $state<{
  registry: RegistryState;
  draw: DrawView | null;
  packs: LoadedPack[];
  fullscreen: boolean;
  hidden: boolean;
  /** The Document PiP window is open; the in-page overlay steps aside. */
  pip: boolean;
  /** Show the emoji bubble (setting). */
  bubbles: boolean;
  /** When the character is on screen (setting). */
  showWhen: ShowWhen;
  /** Emoji, kaomoji or both in the bubble (setting). */
  bubbleStyle: BubbleStyle;
  /** How often a long play gets a new bubble or action (setting). */
  encore: EncoreRate;
}>({
  registry: { primary: null, entries: [] },
  draw: null,
  packs: [],
  fullscreen: false,
  hidden: false,
  pip: false,
  bubbles: true,
  showWhen: 'playing',
  bubbleStyle: 'mix',
  encore: 'often',
});

/** The character to show: the drawn one, else the first pack. */
export function currentPack(): LoadedPack | undefined {
  return live.packs.find((p) => p.id === live.draw?.packId) ?? live.packs[0];
}
