import { describe, expect, test } from 'vitest';
import { assetUrl, desktopBrowser, installBrowserShim } from './browser';

describe('assetUrl', () => {
  test('is absolute, on the app origin, and always starts at the root', () => {
    expect(assetUrl('/packs/index.json', 'http://tauri.localhost')).toBe('http://tauri.localhost/packs/index.json');
    expect(assetUrl('model/config.json', 'http://localhost:1420')).toBe('http://localhost:1420/model/config.json');
  });

  test('the pack loader can build URLs from it (it needs an absolute base)', () => {
    const root = assetUrl('/packs/index.json', 'http://tauri.localhost').replace(/index\.json$/, '');
    expect(new URL('aria/', root).href).toBe('http://tauri.localhost/packs/aria/');
  });

  test('an opaque origin falls back to localhost', () => {
    expect(assetUrl('/x', 'null')).toBe('http://localhost/x');
  });
});

describe('browser shim', () => {
  test('runtime.getURL works', () => {
    expect(desktopBrowser.runtime.getURL('/emoji/a.webp')).toMatch(/\/emoji\/a\.webp$/);
  });

  test('anything else fails loudly', () => {
    const b = desktopBrowser as unknown as Record<string, Record<string, unknown>>;
    expect(() => b.alarms).toThrow(/browser\.alarms is not available/);
    expect(() => b.runtime!.sendMessage).toThrow(/browser\.runtime\.sendMessage is not available/);
    expect(() => b.runtime!.id).toThrow(/not available/);
  });

  test('installBrowserShim sets the global once and keeps an existing one', () => {
    const target: { browser?: unknown } = {};
    installBrowserShim(target);
    expect(target.browser).toBe(desktopBrowser);
    const other = {};
    const t2 = { browser: other };
    installBrowserShim(t2);
    expect(t2.browser).toBe(other);
  });

  test('is installed for the shared code in tests', () => {
    installBrowserShim();
    expect(globalThis.browser.runtime.getURL('/x')).toMatch(/\/x$/);
  });
});
