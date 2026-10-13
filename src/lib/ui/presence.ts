import type { MediaSnapshot } from '../media/types';
import type { RegistryState } from '../registry';

/** When the character is on screen. */
export type ShowWhen = 'playing' | 'always';

/** After the last sound stops, the character stays this long (to resume from its control bar). */
export const IDLE_GRACE_MS = 5 * 60_000;

/** Playing and actually making sound, like the speaker icon on a Chrome tab. */
export function audible(s: MediaSnapshot): boolean {
  return s.playing && !s.muted && s.volume > 0;
}

/**
 * Whether the character should be on screen, the way Chrome's own media button
 * lists media: something is playing with sound somewhere, or was a moment ago.
 * Muted autoplay (video previews, silent banners) never counts.
 *
 * `until`: when this answer turns to hidden by itself (ms epoch), so the caller
 * can check again then; null when only a new state can change it.
 */
export function presence(
  state: RegistryState,
  now: number,
  mode: ShowWhen = 'playing',
  grace = IDLE_GRACE_MS,
): { show: boolean; until: number | null } {
  if (mode === 'always') return { show: true, until: null };
  if (state.entries.some((e) => audible(e.snapshot))) return { show: true, until: null };
  const last = Math.max(0, ...state.entries.map((e) => e.heardAt ?? 0));
  const until = last ? last + grace : 0;
  return until > now ? { show: true, until } : { show: false, until: null };
}
