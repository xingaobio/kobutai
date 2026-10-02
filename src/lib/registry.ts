import type { MediaSnapshot } from './media/types';

export interface MediaEntry {
  /** `${tabId}:${frameId}` */
  key: string;
  tabId: number;
  frameId: number;
  snapshot: MediaSnapshot;
  /** When this entry last went from not-playing to playing (0 = never). */
  startedAt: number;
  /** When the snapshot was received; used to interpolate progress. */
  at: number;
}

export interface RegistryState {
  primary: MediaEntry | null;
  entries: MediaEntry[];
}

export const entryKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

/**
 * All media across tabs. The primary entry is the one that most recently
 * started playing, unless the user picked one manually since then.
 */
export class MediaRegistry {
  private entries = new Map<string, MediaEntry>();
  private manual: string | null = null;

  update(tabId: number, frameId: number, snapshot: MediaSnapshot | null, now = Date.now()): void {
    const key = entryKey(tabId, frameId);
    if (!snapshot) {
      this.entries.delete(key);
      return;
    }
    const prev = this.entries.get(key);
    let startedAt = prev?.startedAt ?? 0;
    if (snapshot.playing && !prev?.snapshot.playing) {
      startedAt = now;
      // A new playback start elsewhere overrides an older manual pick.
      if (this.manual !== key) this.manual = null;
    }
    this.entries.set(key, { key, tabId, frameId, snapshot, startedAt, at: now });
  }

  removeTab(tabId: number): void {
    for (const [k, e] of this.entries) if (e.tabId === tabId) this.entries.delete(k);
  }

  remove(tabId: number, frameId: number): void {
    this.entries.delete(entryKey(tabId, frameId));
  }

  select(key: string): boolean {
    if (!this.entries.has(key)) return false;
    this.manual = key;
    return true;
  }

  get(key: string): MediaEntry | undefined {
    return this.entries.get(key);
  }

  primary(): MediaEntry | null {
    if (this.manual) {
      const m = this.entries.get(this.manual);
      if (m) return m;
      this.manual = null;
    }
    let best: MediaEntry | null = null;
    for (const e of this.entries.values()) {
      if (!best || e.startedAt > best.startedAt || (e.startedAt === best.startedAt && e.at > best.at)) best = e;
    }
    return best;
  }

  state(): RegistryState {
    const entries = [...this.entries.values()].sort((a, b) => b.startedAt - a.startedAt || b.at - a.at);
    return { primary: this.primary(), entries };
  }
}
