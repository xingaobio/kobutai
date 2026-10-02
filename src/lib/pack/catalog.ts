import { loadPackIndex } from './loader';
import type { LoadedPack } from './types';
import { userPacks } from '../settings';

export function builtinRoot(): string {
  return browser.runtime.getURL('/packs/index.json').replace(/index\.json$/, '');
}

/**
 * Every pack the user can draw: built-in ones plus imported ones. Cached and
 * refreshed when imported packs change.
 */
export class PackCatalog {
  private cached: Promise<LoadedPack[]> | null = null;
  private listeners = new Set<(packs: LoadedPack[]) => void>();

  constructor() {
    userPacks.watch(() => {
      this.cached = null;
      void this.all().then((p) => this.listeners.forEach((l) => l(p)));
    });
  }

  all(): Promise<LoadedPack[]> {
    this.cached ??= Promise.all([
      loadPackIndex(builtinRoot(), 'builtin').catch(() => [] as LoadedPack[]),
      userPacks.getValue(),
    ]).then(([builtin, user]) => {
      const ids = new Set(builtin.map((p) => p.id));
      return [...builtin, ...user.filter((p) => !ids.has(p.id))];
    });
    return this.cached;
  }

  onChange(fn: (packs: LoadedPack[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
