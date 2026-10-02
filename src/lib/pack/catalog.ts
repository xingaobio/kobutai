import { loadPackIndex } from './loader';
import type { LoadedPack } from './types';
import { remotePacks, userPacks } from '../settings';

export function builtinRoot(): string {
  return browser.runtime.getURL('/packs/index.json').replace(/index\.json$/, '');
}

/**
 * Every pack the user can draw: built-in, remote-library and imported ones.
 * Cached and refreshed when remote or imported packs change.
 */
export class PackCatalog {
  private cached: Promise<LoadedPack[]> | null = null;
  private listeners = new Set<(packs: LoadedPack[]) => void>();

  constructor() {
    const refresh = () => {
      this.cached = null;
      void this.all().then((p) => this.listeners.forEach((l) => l(p)));
    };
    userPacks.watch(refresh);
    remotePacks.watch(refresh);
  }

  all(): Promise<LoadedPack[]> {
    this.cached ??= Promise.all([
      loadPackIndex(builtinRoot(), 'builtin').catch(() => [] as LoadedPack[]),
      remotePacks.getValue(),
      userPacks.getValue(),
    ]).then(([builtin, remote, user]) => {
      // First one wins on id clashes: built-in, then remote, then imported.
      const seen = new Set<string>();
      return [...builtin, ...remote, ...user].filter((p) => !seen.has(p.id) && seen.add(p.id));
    });
    return this.cached;
  }

  onChange(fn: (packs: LoadedPack[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
