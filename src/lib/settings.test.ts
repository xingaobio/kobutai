import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from '#imports';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampLayout,
  defaultLayout,
  fitLayout,
  getLayout,
  isSiteHidden,
  llmCredentials,
  llmSettings,
  migrateLegacyAi,
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

  test('a wider or taller character keeps the bottom-right corner and stays on screen', () => {
    const view = { w: 1000, h: 800 };
    const l = defaultLayout({ w: 96, h: 208 }, view);
    const right = (x: { x: number; w?: number; scale: number }) => x.x + x.w! * x.scale;
    const wide = fitLayout(l, { w: 144, h: 208 }, view);
    expect(right(wide)).toBeCloseTo(right(l), 0);
    expect(wide.y).toBe(l.y);
    // And back again: the narrow one returns to where it was.
    expect(fitLayout(wide, { w: 96, h: 208 }, view)).toEqual(l);
    // A layout from before sizes were saved is taken as set for the current character.
    expect(fitLayout({ x: 10, y: 20, scale: 1 }, { w: 50, h: 50 }, view)).toEqual({ x: 10, y: 20, scale: 1, w: 50, h: 50 });
    // Never off screen, even for a character wider than the space to its left.
    expect(fitLayout({ x: 5, y: 5, scale: 1, w: 10, h: 10 }, { w: 300, h: 300 }, view)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('legacy AI settings migration', () => {
  const legacy = { enabled: true, apiKey: 'sk-ant-1', model: 'claude-sonnet-5-5', baseURL: '' };

  test('Anthropic key becomes a provider credential and model choice', async () => {
    await storage.setItem('local:aiSettings', legacy);
    await migrateLegacyAi();
    expect(await llmCredentials.getValue()).toEqual({ anthropic: { type: 'api_key', key: 'sk-ant-1' } });
    expect(await llmSettings.getValue()).toEqual({ enabled: true, provider: 'anthropic', model: 'claude-sonnet-5-5', custom: [] });
    expect(await storage.getItem('local:aiSettings')).toBeNull();
  });

  test('a proxy base URL becomes an Anthropic-compatible custom endpoint', async () => {
    await storage.setItem('local:aiSettings', { ...legacy, baseURL: 'https://gw.example.com' });
    await migrateLegacyAi();
    const s = await llmSettings.getValue();
    expect(s.provider).toBe('custom-anthropic-proxy');
    expect(s.custom).toEqual([
      { id: 'custom-anthropic-proxy', name: 'Anthropic 代理', baseUrl: 'https://gw.example.com', api: 'anthropic-messages', models: ['claude-sonnet-5-5'] },
    ]);
    expect(Object.keys(await llmCredentials.getValue())).toEqual(['custom-anthropic-proxy']);
  });

  test('no key or already migrated: legacy item is just dropped', async () => {
    await storage.setItem('local:aiSettings', { ...legacy, apiKey: '' });
    await migrateLegacyAi();
    expect(await llmCredentials.getValue()).toEqual({});
    expect(await storage.getItem('local:aiSettings')).toBeNull();
    await migrateLegacyAi();
  });
});
