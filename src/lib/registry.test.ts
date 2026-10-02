import { describe, expect, test } from 'vitest';
import { MediaRegistry } from './registry';
import type { MediaSnapshot } from './media/types';

const snap = (playing: boolean, title = 't'): MediaSnapshot => ({
  playing,
  currentTime: 0,
  duration: 100,
  volume: 1,
  muted: false,
  title,
  artist: '',
  canNext: false,
  canPrev: false,
  canSeek: true,
  adapter: 'generic',
  site: 'e.com',
});

describe('MediaRegistry', () => {
  test('empty', () => {
    expect(new MediaRegistry().primary()).toBeNull();
  });

  test('primary is the last one that started playing', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), 100);
    r.update(2, 0, snap(true), 200);
    expect(r.primary()?.key).toBe('2:0');
    // Progress updates don't change start time.
    r.update(1, 0, snap(true), 300);
    expect(r.primary()?.key).toBe('2:0');
    // Pausing and resuming tab 1 makes it the newest start.
    r.update(1, 0, snap(false), 400);
    r.update(1, 0, snap(true), 500);
    expect(r.primary()?.key).toBe('1:0');
  });

  test('paused media stays primary until something else starts', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), 100);
    r.update(2, 0, snap(false), 150);
    r.update(1, 0, snap(false), 200);
    expect(r.primary()?.key).toBe('1:0');
  });

  test('manual selection wins until another playback starts', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), 100);
    r.update(2, 0, snap(true), 200);
    expect(r.select('1:0')).toBe(true);
    expect(r.primary()?.key).toBe('1:0');
    r.update(2, 0, snap(true), 300); // still the same playback, no new start
    expect(r.primary()?.key).toBe('1:0');
    r.update(3, 0, snap(true), 400);
    expect(r.primary()?.key).toBe('3:0');
  });

  test('select unknown key is rejected', () => {
    expect(new MediaRegistry().select('9:0')).toBe(false);
  });

  test('removal and null snapshots drop entries', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), 100);
    r.update(1, 5, snap(true), 110);
    r.update(2, 0, snap(true), 200);
    r.select('2:0');
    r.removeTab(2);
    expect(r.primary()?.key).toBe('1:5');
    r.update(1, 5, null);
    expect(r.primary()?.key).toBe('1:0');
    r.remove(1, 0);
    expect(r.state()).toEqual({ primary: null, entries: [] });
  });

  test('state lists newest first', () => {
    const r = new MediaRegistry();
    r.update(1, 0, snap(true), 100);
    r.update(2, 0, snap(true), 200);
    expect(r.state().entries.map((e) => e.key)).toEqual(['2:0', '1:0']);
  });
});
