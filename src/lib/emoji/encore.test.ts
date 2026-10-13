import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ENCORE_GAP_MS, ENCORE_KAOMOJI_SHARE, EncoreScheduler, PlayClock, encoreBubble, encoreGap } from './encore';
import { KAOMOJI, type BubbleContent } from './kaomoji';
import { encoreMoods, pickEmoji } from './pick';

const MIN = 60_000;
const song = (title: string, artist = '') => ({ title, artist });
/** A repeatable stand-in for Math.random. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('encore pace', () => {
  test('"often" is every few minutes, "sometimes" about every ten, and never a fixed beat', () => {
    expect(encoreGap('often', () => 0)).toBe(3 * MIN);
    expect(encoreGap('often', () => 0.9999)).toBeLessThanOrEqual(6 * MIN);
    expect(encoreGap('sometimes', () => 0)).toBe(8 * MIN);
    expect(encoreGap('sometimes', () => 0.5)).toBe(10 * MIN);
    const rng = seeded();
    const gaps = new Set(Array.from({ length: 20 }, () => encoreGap('often', rng)));
    expect(gaps.size).toBeGreaterThan(10);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(ENCORE_GAP_MS.often[0]);
      expect(g).toBeLessThanOrEqual(ENCORE_GAP_MS.often[1]);
    }
  });
});

describe('encoreMoods', () => {
  test('starts with what the track bubble said, then the genre and a few that suit any music', () => {
    const tags = { type: 'music', genre: 'rock' } as const;
    const moods = encoreMoods(song('Numb', 'Linkin Park'), tags);
    expect(moods[0]).toBe(pickEmoji(song('Numb', 'Linkin Park'), tags));
    expect(moods).toEqual(expect.arrayContaining(['guitar', 'rock-hand', 'notes', 'heart']));
    expect(new Set(moods).size).toBe(moods.length);
  });

  test('non-music gets its own set', () => {
    const moods = encoreMoods(song('How Transformers Work'), { type: 'video', genre: null });
    expect(moods).toEqual(expect.arrayContaining(['popcorn', 'eyes', 'thinking']));
    expect(moods).not.toContain('guitar');
    expect(encoreMoods(song('E120 聊聊'), { type: 'podcast', genre: null })).toEqual(expect.arrayContaining(['thinking', 'coffee']));
    // No tags yet: still something musical.
    expect(encoreMoods(song('Something'), null).length).toBeGreaterThan(1);
  });

  test('a title that names its mood stays in that mood', () => {
    const sad = encoreMoods(song('伤心的人别听慢歌'), { type: 'music', genre: 'western-pop' });
    expect(sad[0]).toBe('sob');
    expect(sad).not.toContain('party-popper');
    expect(sad).not.toContain('heart');
    expect(encoreMoods(song('Happy Birthday to You'), { type: 'music', genre: 'western-pop' })[0]).toBe('cake');
  });
});

describe('encoreBubble', () => {
  const moods = ['guitar', 'rock-hand', 'notes'] as const;

  test('follows the style; mixed leans to kaomoji', () => {
    const rng = seeded(7);
    for (let i = 0; i < 20; i++) {
      expect(encoreBubble(moods, 'emoji', rng).kind).toBe('emoji');
      const k = encoreBubble(moods, 'kaomoji', rng);
      expect(k.kind).toBe('kaomoji');
      expect(KAOMOJI[k.name]).toContain(k.kind === 'kaomoji' ? k.text : '');
    }
    const kinds = Array.from({ length: 400 }, () => encoreBubble(moods, 'mix', rng).kind);
    const share = kinds.filter((k) => k === 'kaomoji').length / kinds.length;
    expect(share).toBeGreaterThan(ENCORE_KAOMOJI_SHARE - 0.1);
    expect(share).toBeLessThan(ENCORE_KAOMOJI_SHARE + 0.1);
    expect(new Set(kinds)).toEqual(new Set(['emoji', 'kaomoji']));
  });

  test('never the same bubble twice in a row, and it gets around', () => {
    const rng = seeded(3);
    for (const style of ['emoji', 'kaomoji', 'mix'] as const) {
      let prev: BubbleContent | null = null;
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const b: BubbleContent = encoreBubble(moods, style, rng, prev);
        expect(b).not.toEqual(prev);
        seen.add(JSON.stringify(b));
        prev = b;
      }
      expect(seen.size).toBeGreaterThanOrEqual(3);
    }
  });

  test('a single option is still shown rather than nothing', () => {
    const only: BubbleContent = { kind: 'emoji', name: 'violin' };
    expect(encoreBubble(['violin'], 'emoji', () => 0, only)).toEqual(only);
  });
});

describe('PlayClock', () => {
  test('counts playing time only', () => {
    const c = new PlayClock();
    c.reset(0, 5 * MIN);
    expect(c.running).toBe(false);
    c.start(1000);
    expect(c.remaining(1000 + 2 * MIN)).toBe(3 * MIN);
    c.stop(1000 + 2 * MIN);
    // An hour paused changes nothing.
    expect(c.remaining(1000 + 62 * MIN)).toBe(3 * MIN);
    c.start(1000 + 62 * MIN);
    expect(c.remaining(1000 + 65 * MIN)).toBe(0);
    c.advance(1000 + 65 * MIN, 4 * MIN);
    expect(c.remaining(1000 + 66 * MIN)).toBe(3 * MIN);
  });
});

describe('EncoreScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** rng 0 → always the shortest gap: 3 min for "often", 8 for "sometimes". */
  const setup = () => {
    const fire = vi.fn();
    return { fire, s: new EncoreScheduler(fire, () => 0) };
  };
  const pass = (minutes: number) => vi.advanceTimersByTime(minutes * MIN);

  test('a 20-minute play gets an encore every gap', () => {
    const { fire, s } = setup();
    s.update({ key: 'video', playing: true, rate: 'often' });
    pass(2.9);
    expect(fire).not.toHaveBeenCalled();
    pass(0.2);
    expect(fire).toHaveBeenCalledTimes(1);
    // Snapshots keep arriving about once a second; they must not restart the count.
    for (let i = 0; i < 100; i++) {
      vi.advanceTimersByTime(1000);
      s.update({ key: 'video', playing: true, rate: 'often' });
    }
    pass(15.2);
    expect(fire).toHaveBeenCalledTimes(6);
  });

  test('pausing stops the count; it resumes where it was', () => {
    const { fire, s } = setup();
    s.update({ key: 'video', playing: true, rate: 'often' });
    pass(2);
    s.update({ key: 'video', playing: false, rate: 'often' });
    pass(30);
    expect(fire).not.toHaveBeenCalled();
    s.update({ key: 'video', playing: true, rate: 'often' });
    pass(0.9);
    expect(fire).not.toHaveBeenCalled();
    pass(0.2);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  test('a new track starts the count again, so short songs get none', () => {
    const { fire, s } = setup();
    for (const key of ['song 1', 'song 2', 'song 3', 'song 4']) {
      s.update({ key, playing: true, rate: 'often' });
      pass(2.8);
    }
    expect(fire).not.toHaveBeenCalled();
    pass(0.3);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  test('the setting: slower, off, and back on', () => {
    const { fire, s } = setup();
    s.update({ key: 'video', playing: true, rate: 'sometimes' });
    pass(7.9);
    expect(fire).not.toHaveBeenCalled();
    pass(0.2);
    expect(fire).toHaveBeenCalledTimes(1);
    s.update({ key: 'video', playing: true, rate: 'off' });
    pass(60);
    expect(fire).toHaveBeenCalledTimes(1);
    s.update({ key: 'video', playing: true, rate: 'often' });
    pass(3.1);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  test('nothing playing, or the view going away, leaves no timer behind', () => {
    const { fire, s } = setup();
    s.update({ key: null, playing: true, rate: 'often' });
    expect(vi.getTimerCount()).toBe(0);
    s.update({ key: 'video', playing: true, rate: 'often' });
    expect(vi.getTimerCount()).toBe(1);
    s.stop();
    expect(vi.getTimerCount()).toBe(0);
    pass(60);
    expect(fire).not.toHaveBeenCalled();
  });
});
