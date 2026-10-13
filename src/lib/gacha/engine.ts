import type { MediaSnapshot } from '../media/types';
import type { PackManifest } from '../pack/types';
import { contentKey, type MediaInfo, type Tags } from '../tagging/types';
import { pick, poolFor } from './pool';

export interface Draw {
  contentKey: string;
  packId: string;
  tags: Pick<Tags, 'type' | 'genre' | 'vclass' | 'source'>;
  rerolled: boolean;
}

/** What overlays need to render the current draw. */
export interface DrawView {
  packId: string;
  tags: Draw['tags'];
  locked: boolean;
  canReroll: boolean;
}

export interface GachaState {
  current: Draw | null;
  recent: Draw[];
}

export interface GachaDeps {
  packs(): Promise<Pick<PackManifest, 'id' | 'tags'>[]>;
  tag(info: MediaInfo): Promise<Tags>;
  rng(): number;
  locked(): Promise<string | null>;
  /** Called for every pack that is drawn (collection / 图鉴). */
  record(packId: string): Promise<void>;
  /** Survive service-worker restarts. */
  load(): Promise<GachaState | null>;
  save(state: GachaState): Promise<void>;
}

/**
 * "Change once" draws from every pack made for this content: the video-kind preference
 * (ent → one character, info → another) picks the first character, not the only one.
 */
function rerollTags(t: Draw['tags']): Pick<Tags, 'type' | 'genre'> {
  return { type: t.type, genre: t.genre };
}

/** Remember draws for this many recent contents so switching back doesn't redraw. */
export const RECENT_LIMIT = 50;

export function infoOf(s: MediaSnapshot): MediaInfo {
  return {
    title: s.title,
    artist: s.artist,
    site: s.site,
    ...(s.duration > 0 ? { duration: s.duration } : {}),
    ...(s.live ? { live: true } : {}),
  };
}

/**
 * One draw per new piece of content, a single same-pool reroll, and a lock that
 * pins one character. Owns the "current character" shown in every tab.
 */
export class GachaEngine {
  private current: Draw | null = null;
  private recent = new Map<string, Draw>();
  private inflight = new Map<string, Promise<Draw | null>>();
  private wanted: string | null = null;
  private ready: Promise<void>;

  constructor(private readonly deps: GachaDeps) {
    this.ready = deps.load().then((s) => {
      if (!s) return;
      for (const d of s.recent) this.recent.set(d.contentKey, d);
      this.current = s.current;
    }).catch(() => {});
  }

  /** The lock only counts if that pack exists here (sync storage may name a pack imported on another device). */
  private async lockedId(): Promise<string | null> {
    const locked = await this.deps.locked();
    if (!locked) return null;
    return (await this.deps.packs()).some((p) => p.id === locked) ? locked : null;
  }

  /** Collection bookkeeping must never block or break a draw. */
  private record(packId: string): void {
    this.deps.record(packId).catch((e) => console.warn('[happydesk] could not record draw', e));
  }

  async view(): Promise<DrawView | null> {
    await this.ready;
    const locked = await this.lockedId();
    const packs = await this.deps.packs();
    if (locked) {
      return { packId: locked, tags: this.current?.tags ?? { type: 'other', genre: null, source: 'rules' }, locked: true, canReroll: false };
    }
    if (!this.current) return null;
    const pool = poolFor(packs, rerollTags(this.current.tags));
    return {
      packId: this.current.packId,
      tags: this.current.tags,
      locked: false,
      canReroll: !this.current.rerolled && pool.some((p) => p.id !== this.current!.packId),
    };
  }

  /**
   * Feed the primary media. Returns true when the current draw changed.
   * Only playing content triggers a draw; pausing keeps the character.
   */
  async onMedia(snap: MediaSnapshot | null): Promise<boolean> {
    await this.ready;
    if (!snap?.playing || !snap.title) return false;
    const info = infoOf(snap);
    const key = contentKey(info);
    this.wanted = key;
    if (this.current?.contentKey === key) return false;
    // A locked character means no draws at all (and no AI calls).
    if (await this.lockedId()) return false;

    const known = this.recent.get(key);
    if (known) return this.setCurrent(known);

    let p = this.inflight.get(key);
    if (!p) {
      p = this.draw(key, info).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    const draw = await p;
    // Content may have changed while we were tagging; only the latest wins.
    if (!draw || this.wanted !== key || this.current?.contentKey === key) return false;
    return this.setCurrent(draw);
  }

  async reroll(): Promise<boolean> {
    await this.ready;
    const cur = this.current;
    if (!cur || cur.rerolled || (await this.lockedId())) return false;
    const pool = poolFor(await this.deps.packs(), rerollTags(cur.tags)).filter((p) => p.id !== cur.packId);
    const next = pick(pool, this.deps.rng);
    if (!next) return false;
    this.record(next.id);
    return this.setCurrent({ ...cur, packId: next.id, rerolled: true });
  }

  private async draw(key: string, info: MediaInfo): Promise<Draw | null> {
    const tags = await this.deps.tag(info);
    const pool = poolFor(await this.deps.packs(), tags);
    const chosen = pick(pool, this.deps.rng);
    if (!chosen) return null;
    this.record(chosen.id);
    const kept: Draw['tags'] = { type: tags.type, genre: tags.genre, ...(tags.vclass ? { vclass: tags.vclass } : {}), source: tags.source };
    return { contentKey: key, packId: chosen.id, tags: kept, rerolled: false };
  }

  private setCurrent(d: Draw): boolean {
    this.current = d;
    this.recent.delete(d.contentKey);
    this.recent.set(d.contentKey, d);
    while (this.recent.size > RECENT_LIMIT) this.recent.delete(this.recent.keys().next().value!);
    void this.deps.save({ current: d, recent: [...this.recent.values()] }).catch(() => {});
    return true;
  }
}
