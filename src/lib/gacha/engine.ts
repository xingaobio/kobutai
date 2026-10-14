import type { MediaSnapshot } from '../media/types';
import type { PackManifest } from '../pack/types';
import { contentKey, type MediaInfo, type Tags } from '../tagging/types';
import { pick, poolFor } from './pool';

export interface Draw {
  contentKey: string;
  packId: string;
  tags: Pick<Tags, 'type' | 'genre' | 'vclass' | 'source'>;
  rerolled: boolean;
  /** The character was chosen because the content names it, not drawn from a pool. */
  matched?: boolean;
  /** Kept for matched draws, so "换一次" can ask for another character of the same match. */
  info?: MediaInfo;
}

/** What overlays need to render the current draw. */
export interface DrawView {
  /** Which content this draw belongs to (contentKey), so overlays can tell a fresh draw from the last one. */
  contentKey?: string;
  packId: string;
  tags: Draw['tags'];
  locked: boolean;
  canReroll: boolean;
  matched?: boolean;
}

export interface GachaState {
  current: Draw | null;
  recent: Draw[];
}

export interface GachaDeps {
  packs(): Promise<Pick<PackManifest, 'id' | 'tags'>[]>;
  tag(info: MediaInfo): Promise<Tags>;
  /**
   * Optional direct match: the id of a pack that depicts what this content names
   * (see lib/match). It wins over the pool draw when that pack is installed.
   */
  match?(info: MediaInfo): Promise<string | null>;
  /** Another matched character for this content (reroll of a matched draw), or null. */
  rematch?(info: MediaInfo, current: string): Promise<string | null>;
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
    this.deps.record(packId).catch((e) => console.warn('[kobutai] could not record draw', e));
  }

  async view(): Promise<DrawView | null> {
    await this.ready;
    const locked = await this.lockedId();
    const packs = await this.deps.packs();
    if (locked) {
      return {
        contentKey: this.current?.contentKey,
        packId: locked,
        tags: this.current?.tags ?? { type: 'other', genre: null, source: 'rules' },
        locked: true,
        canReroll: false,
      };
    }
    if (!this.current) return null;
    const pool = poolFor(packs, rerollTags(this.current.tags));
    return {
      contentKey: this.current.contentKey,
      packId: this.current.packId,
      tags: this.current.tags,
      locked: false,
      canReroll: !this.current.rerolled && pool.some((p) => p.id !== this.current!.packId),
      ...(this.current.matched ? { matched: true } : {}),
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
    // A matched character rerolls to another character of the same match (another Miku…).
    if (cur.matched && cur.info && this.deps.rematch) {
      const other = await this.deps.rematch(cur.info, cur.packId).catch(() => null);
      // Read the pack list after the rematch: it may have just downloaded that character.
      if (other && other !== cur.packId && (await this.deps.packs()).some((p) => p.id === other)) {
        this.record(other);
        return this.setCurrent({ ...cur, packId: other, rerolled: true });
      }
    }
    // Otherwise (or when the match has only one character): the content's ordinary pool.
    const pool = poolFor(await this.deps.packs(), rerollTags(cur.tags)).filter((p) => p.id !== cur.packId);
    const next = pick(pool, this.deps.rng);
    if (!next) return false;
    this.record(next.id);
    return this.setCurrent({ contentKey: cur.contentKey, packId: next.id, tags: cur.tags, rerolled: true });
  }

  /**
   * A match that arrived after its content was already drawn from the pool (the
   * character was still downloading): switch that content to the character.
   * Returns true when what is on screen changed.
   */
  async adopt(info: MediaInfo, packId: string): Promise<boolean> {
    await this.ready;
    const key = contentKey(info);
    const isCurrent = this.current?.contentKey === key;
    const draw = isCurrent ? this.current! : this.recent.get(key);
    // A reroll is the user's choice; never undo it.
    if (!draw || draw.rerolled || draw.packId === packId) return false;
    if (!(await this.deps.packs()).some((p) => p.id === packId)) return false;
    const next: Draw = { ...draw, packId, matched: true, info };
    this.record(packId);
    if (isCurrent) return this.setCurrent(next) && !(await this.lockedId());
    this.recent.set(key, next);
    this.save();
    return false;
  }

  /**
   * The pack list changed. A character that is gone (deleted from the 图鉴, its
   * library removed…) must not stay on screen or come back from the recent draws:
   * the current content gets another character of its pool. Returns true when what
   * is on screen changed.
   */
  async prune(): Promise<boolean> {
    await this.ready;
    const packs = await this.deps.packs();
    const have = new Set(packs.map((p) => p.id));
    let dropped = false;
    for (const [key, d] of this.recent) {
      if (have.has(d.packId) || key === this.current?.contentKey) continue;
      this.recent.delete(key);
      dropped = true;
    }
    const cur = this.current;
    if (!cur || have.has(cur.packId)) {
      if (dropped) this.save();
      return false;
    }
    // Not a reroll: the user's one "换一次" for this content is still theirs.
    const next = pick(poolFor(packs, cur.tags), this.deps.rng);
    if (!next) {
      this.recent.delete(cur.contentKey);
      this.current = null;
      this.save();
      return true;
    }
    this.record(next.id);
    return this.setCurrent({ contentKey: cur.contentKey, packId: next.id, tags: cur.tags, rerolled: cur.rerolled });
  }

  private save(): void {
    void this.deps.save({ current: this.current, recent: [...this.recent.values()] }).catch(() => {});
  }

  private async draw(key: string, info: MediaInfo): Promise<Draw | null> {
    // Tagging and matching don't depend on each other; a failed match is just "no match".
    const [tags, matchedId] = await Promise.all([
      this.deps.tag(info),
      this.deps.match ? this.deps.match(info).catch(() => null) : null,
    ]);
    const packs = await this.deps.packs();
    const matched = matchedId ? packs.find((p) => p.id === matchedId) : undefined;
    const chosen = matched ?? pick(poolFor(packs, tags), this.deps.rng);
    if (!chosen) return null;
    this.record(chosen.id);
    const kept: Draw['tags'] = { type: tags.type, genre: tags.genre, ...(tags.vclass ? { vclass: tags.vclass } : {}), source: tags.source };
    return { contentKey: key, packId: chosen.id, tags: kept, rerolled: false, ...(matched ? { matched: true, info } : {}) };
  }

  private setCurrent(d: Draw): boolean {
    this.current = d;
    this.recent.delete(d.contentKey);
    this.recent.set(d.contentKey, d);
    while (this.recent.size > RECENT_LIMIT) this.recent.delete(this.recent.keys().next().value!);
    this.save();
    return true;
  }
}
