import { pick } from '../gacha/pool';
import { KAOMOJI, type BubbleContent, type BubbleStyle } from './kaomoji';
import type { EmojiName } from './sheets.gen';

/**
 * Encores: during a long play (a 20-minute video, a mix, a stream) the same
 * character stays on screen, so every few minutes it says something new (another
 * kaomoji or emoji that fits the content) and sometimes does its little action.
 */
export type EncoreRate = 'off' | 'sometimes' | 'often';

/** Playback time between two encores, [min, max] in ms. Random in between so it never feels like a timer. */
export const ENCORE_GAP_MS: Record<Exclude<EncoreRate, 'off'>, readonly [number, number]> = {
  often: [3 * 60_000, 6 * 60_000],
  sometimes: [8 * 60_000, 12 * 60_000],
};

/** In the mixed style an encore is a kaomoji this often (the track's first bubble stays 50/50). */
export const ENCORE_KAOMOJI_SHARE = 0.7;
/** How often an encore comes with the character's action (when bubbles are off, it is always the action). */
export const ENCORE_ACT_CHANCE = 0.5;

/** `rng` returns [0, 1). */
export function encoreGap(rate: Exclude<EncoreRate, 'off'>, rng: () => number): number {
  const [min, max] = ENCORE_GAP_MS[rate];
  return Math.round(min + rng() * (max - min));
}

const same = (a: BubbleContent, b: BubbleContent | null | undefined) =>
  !!b && a.kind === b.kind && a.name === b.name && (a.kind !== 'kaomoji' || (b.kind === 'kaomoji' && a.text === b.text));

/**
 * The bubble for an encore: one of the content's `moods` in the user's style, and
 * never the bubble that was shown last (so each encore is visibly a change).
 */
export function encoreBubble(
  moods: readonly EmojiName[],
  style: BubbleStyle,
  rng: () => number,
  previous?: BubbleContent | null,
): BubbleContent {
  const kind = style === 'mix' ? (rng() < ENCORE_KAOMOJI_SHARE ? 'kaomoji' : 'emoji') : style;
  const options: BubbleContent[] =
    kind === 'emoji'
      ? moods.map((name) => ({ kind, name }))
      : moods.flatMap((name) => KAOMOJI[name].map((text) => ({ kind, name, text })));
  const fresh = options.filter((o) => !same(o, previous));
  return pick(fresh.length ? fresh : options, rng)!;
}

/**
 * A stopwatch that only runs while media is playing, with one deadline on it:
 * pausing a video does not bring the next encore closer.
 */
export class PlayClock {
  private played = 0;
  private since: number | null = null;
  private due = Infinity;

  get running(): boolean {
    return this.since !== null;
  }

  /** Ms of playback counted so far. */
  elapsed(now: number): number {
    return this.played + (this.since === null ? 0 : now - this.since);
  }

  /** New content (or a new pace): count from zero, first deadline after `gap` ms of playback. */
  reset(now: number, gap: number): void {
    this.played = 0;
    if (this.since !== null) this.since = now;
    this.due = gap;
  }

  start(now: number): void {
    this.since ??= now;
  }

  stop(now: number): void {
    if (this.since === null) return;
    this.played += now - this.since;
    this.since = null;
  }

  /** Ms of playback left before the deadline; 0 once it has passed. */
  remaining(now: number): number {
    return Math.max(0, this.due - this.elapsed(now));
  }

  /** The deadline was reached: the next one is `gap` ms of playback from now. */
  advance(now: number, gap: number): void {
    this.due = this.elapsed(now) + gap;
  }
}

/**
 * Calls `fire` each time the current content has played for another gap. Feed it
 * every state update (cheap); it keeps one timer, and only while something plays.
 */
export class EncoreScheduler {
  private readonly clock = new PlayClock();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private key: string | null = null;
  private rate: EncoreRate = 'off';

  constructor(
    private readonly fire: () => void,
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** `key`: what is playing (contentKey), null for nothing. */
  update(state: { key: string | null; playing: boolean; rate: EncoreRate }): void {
    const now = this.now();
    let changed = false;
    if (state.key !== this.key || state.rate !== this.rate) {
      this.key = state.key;
      this.rate = state.rate;
      if (state.rate !== 'off') this.clock.reset(now, encoreGap(state.rate, this.rng));
      changed = true;
    }
    if (state.playing && state.key && state.rate !== 'off') {
      if (this.clock.running && !changed) return;
      this.clock.start(now);
      this.arm();
    } else {
      this.stop();
    }
  }

  /** Pause the count and drop the timer (the view is going away, or nothing plays). */
  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.clock.stop(this.now());
  }

  private arm(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), this.clock.remaining(this.now()));
  }

  private tick(): void {
    const now = this.now();
    if (!this.clock.running || this.rate === 'off') return;
    // Timers can fire early; wait out the rest.
    if (this.clock.remaining(now) > 0) return this.arm();
    this.clock.advance(now, encoreGap(this.rate, this.rng));
    this.arm();
    this.fire();
  }
}
