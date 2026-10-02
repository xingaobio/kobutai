import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampLayout,
  defaultLayout,
  getLayout,
  isSiteHidden,
  setLayout,
  setSiteHidden,
} from './settings';

beforeEach(() => fakeBrowser.reset());

describe('site hiding', () => {
  test('toggle per host', async () => {
    expect(await isSiteHidden('a.com')).toBe(false);
    await setSiteHidden('a.com', true);
    await setSiteHidden('a.com', true);
    await setSiteHidden('b.com', true);
    expect(await isSiteHidden('a.com')).toBe(true);
    await setSiteHidden('a.com', false);
    expect(await isSiteHidden('a.com')).toBe(false);
    expect(await isSiteHidden('b.com')).toBe(true);
  });
});

describe('layout', () => {
  test('persists per host', async () => {
    await setLayout('a.com', { x: 10, y: 20, scale: 1 });
    expect(await getLayout('a.com')).toEqual({ x: 10, y: 20, scale: 1 });
    expect(await getLayout('b.com')).toBeNull();
  });

  test('clamps into viewport and scale range', () => {
    const box = { w: 100, h: 100 };
    const view = { w: 500, h: 400 };
    expect(clampLayout({ x: -50, y: 9999, scale: 1 }, box, view)).toEqual({ x: 0, y: 300, scale: 1 });
    expect(clampLayout({ x: 0, y: 0, scale: 99 }, box, view).scale).toBe(MAX_SCALE);
    expect(clampLayout({ x: 0, y: 0, scale: 0 }, box, view).scale).toBe(MIN_SCALE);
  });

  test('default sits in the bottom-right corner', () => {
    const l = defaultLayout({ w: 100, h: 100 }, { w: 1000, h: 800 });
    expect(l.x).toBeGreaterThan(800);
    expect(l.y).toBeGreaterThan(600);
  });
});
