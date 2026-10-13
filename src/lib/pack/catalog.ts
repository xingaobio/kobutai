import { loadPackIndex } from './loader';
import type { LoadedPack } from './types';
import { remotePacks, removedPacks, userPacks } from '../settings';

export function builtinRoot(): string {
  return browser.runtime.getURL('/packs/index.json').replace(/index\.json$/, '');
}

/** Split packs into the ones in use and the ones the user deleted from the 图鉴. */
export function splitRemoved<P extends { id: string }>(packs: readonly P[], removedIds: readonly string[]): { kept: P[]; removed: P[] } {
  const gone = new Set(removedIds);
  return { kept: packs.filter((p) => !gone.has(p.id)), removed: packs.filter((p) => gone.has(p.id)) };
}

/**
 * Every pack the user can draw: built-in, remote-library and imported ones, minus
 * the ones deleted from the 图鉴. Cached and refreshed when any of those change.
 */
export class PackCatalog {
  private cached: Promise<{ kept: LoadedPack[]; removed: LoadedPack[] }> | null = null;
  private listeners = new Set<(packs: LoadedPack[]) => void>();

  constructor() {
    const refresh = () => {
      this.cached = null;
      void this.all().then((p) => this.listeners.forEach((l) => l(p)));
    };
    userPacks.watch(refresh);
    remotePacks.watch(refresh);
    removedPacks.watch(refresh);
  }

  private load(): Promise<{ kept: LoadedPack[]; removed: LoadedPack[] }> {
    this.cached ??= Promise.all([
      loadPackIndex(builtinRoot(), 'builtin').catch(() => [] as LoadedPack[]),
      remotePacks.getValue(),
      userPacks.getValue(),
      removedPacks.getValue(),
    ]).then(([builtin, remote, user, removedIds]) => {
      // First one wins on id clashes: built-in, then remote, then imported.
      const seen = new Set<string>();
      const every = [...builtin, ...remote, ...user].filter((p) => !seen.has(p.id) && seen.add(p.id));
      return splitRemoved(every, removedIds);
    });
    return this.cached;
  }

  /** The packs that can be drawn and shown. */
  all(): Promise<LoadedPack[]> {
    return this.load().then((s) => s.kept);
  }

  /** Packs deleted from the 图鉴 that still exist and can be restored. */
  removed(): Promise<LoadedPack[]> {
    return this.load().then((s) => s.removed);
  }

  /** Read storage again on the next `all()`: for callers that just wrote a pack and can't wait for the watcher. */
  invalidate(): void {
    this.cached = null;
  }

  onChange(fn: (packs: LoadedPack[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
