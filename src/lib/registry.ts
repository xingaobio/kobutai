import type { MediaSnapshot } from './media/types';
import { audible } from './ui/presence';

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
  /** When this entry was last heard (playing, not muted); 0 = not since the worker started. */
  heardAt: number;
}

export interface RegistryState {
  primary: MediaEntry | null;
  entries: MediaEntry[];
}

export const entryKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

/** What must survive a service-worker restart; snapshots themselves are re-sent by the frames. */
export interface RegistryMeta {
  manual: string | null;
  started: Record<string, number>;
}

/**
 * All media across tabs. The primary entry is the one that most recently
 * started playing, unless the user picked one manually since then.
 */
export class MediaRegistry {
  private entries = new Map<string, MediaEntry>();
  private manual: string | null = null;
  /** Start times restored after a restart, applied when the frame reconnects. */
  private restored = new Map<string, number>();

  exportMeta(): RegistryMeta {
    const started: Record<string, number> = {};
    for (const e of this.entries.values()) if (e.startedAt) started[e.key] = e.startedAt;
    return { manual: this.manual, started };
  }

  importMeta(meta: RegistryMeta): void {
    for (const [key, at] of Object.entries(meta.started)) {
      const e = this.entries.get(key);
      // Frames may have reconnected before the meta loaded; their "start" was just the reconnect.
      if (e) e.startedAt = at;
      else this.restored.set(key, at);
    }
    if (!this.manual && meta.manual) this.manual = meta.manual;
  }

  update(tabId: number, frameId: number, snapshot: MediaSnapshot | null, now = Date.now()): void {
    const key = entryKey(tabId, frameId);
    if (!snapshot) {
      this.entries.delete(key);
      return;
    }
    const prev = this.entries.get(key);
    let startedAt = prev?.startedAt ?? 0;
    const restoredAt = prev ? undefined : this.restored.get(key);
    if (restoredAt !== undefined) {
      this.restored.delete(key);
      startedAt = restoredAt;
    } else if (snapshot.playing && !prev?.snapshot.playing) {
      startedAt = now;
      // A new playback start elsewhere overrides an older manual pick.
      if (this.manual !== key) this.manual = null;
    }
    const heardAt = audible(snapshot) ? now : (prev?.heardAt ?? 0);
    this.entries.set(key, { key, tabId, frameId, snapshot, startedAt, at: now, heardAt });
  }

  removeTab(tabId: number): void {
    for (const e of [...this.entries.values()]) if (e.tabId === tabId) this.remove(e.tabId, e.frameId);
  }

  remove(tabId: number, frameId: number): void {
    const key = entryKey(tabId, frameId);
    this.entries.delete(key);
    this.restored.delete(key);
    if (this.manual === key) this.manual = null;
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
    // A manual pick whose frame hasn't reconnected yet (after a restart) is ignored until it does.
    const m = this.manual ? this.entries.get(this.manual) : undefined;
    if (m) return m;
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
