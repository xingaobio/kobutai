import { describe, expect, test } from 'vitest';
import { MediaRegistry } from '../registry';
import type { MediaSnapshot } from '../media/types';
import { IDLE_GRACE_MS, presence } from './presence';

const snap = (playing: boolean, more: Partial<MediaSnapshot> = {}): MediaSnapshot => ({
  playing,
  currentTime: 0,
  duration: 100,
  volume: 1,
  muted: false,
  title: 't',
  artist: '',
  canNext: false,
  canPrev: false,
  canSeek: true,
  adapter: 'generic',
  site: 'e.com',
  ...more,
});

const MIN = 60_000;

describe('presence (when the character is on screen)', () => {
  test('nothing reported anywhere: hidden', () => {
    expect(presence(new MediaRegistry().state(), 0)).toEqual({ show: false, until: null });
  });

  test('a page with media that never played: hidden', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(false), 0);
    expect(presence(r.state(), 1000).show).toBe(false);
  });

  test('something playing with sound in any tab: shown', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(false), 0);
    r.update(2, 0, snap(true), 0);
    expect(presence(r.state(), 10 * MIN)).toEqual({ show: true, until: null });
  });

  test('muted or silent autoplay does not count', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true, { muted: true }), 0);
    r.update(2, 0, snap(true, { volume: 0 }), 0);
    expect(presence(r.state(), 1000).show).toBe(false);
  });

  test('after pausing it stays a few minutes, then hides; playing again brings it back', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), MIN);
    r.update(1, 0, snap(true, { currentTime: 60 }), 2 * MIN); // last progress report while playing
    r.update(1, 0, snap(false, { currentTime: 60 }), 2 * MIN);
    expect(presence(r.state(), 3 * MIN)).toEqual({ show: true, until: 2 * MIN + IDLE_GRACE_MS });
    expect(presence(r.state(), 2 * MIN + IDLE_GRACE_MS).show).toBe(false);
    r.update(1, 0, snap(true), 20 * MIN);
    expect(presence(r.state(), 20 * MIN).show).toBe(true);
  });

  test('muting keeps it only for the grace period', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), MIN);
    r.update(1, 0, snap(true, { muted: true }), 2 * MIN);
    expect(presence(r.state(), 3 * MIN).show).toBe(true);
    expect(presence(r.state(), MIN + IDLE_GRACE_MS).show).toBe(false);
  });

  test('closing the playing tab hides it at once', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), 0);
    r.removeTab(1);
    expect(presence(r.state(), 1000).show).toBe(false);
  });

  test('"always" shows it with nothing playing', () => {
    expect(presence(new MediaRegistry().state(), 0, 'always').show).toBe(true);
  });
});
