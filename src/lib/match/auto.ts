import { safeSlug, type PetdexEntry } from '../petdex';
import type { MediaInfo } from '../tagging/types';
import { RuleMatcher, type MatchRule } from './matcher';

/** What is needed to download one Petdex character. */
export type PetRef = Pick<PetdexEntry, 'slug' | 'displayName' | 'submittedBy' | 'spritesheetUrl'>;

/** The slice of the Petdex manifest the rules refer to, so the 1.7 MB manifest isn't kept around. */
export interface MatchIndex {
  /** When the manifest was last downloaded (ms epoch). */
  at: number;
  pets: Record<string, PetRef>;
}

/** Sheet URLs carry a content hash, so look them up again after a day. */
export const INDEX_TTL_MS = 24 * 60 * 60 * 1000;
/** Sheets are ~2 MB each; beyond this the least recently matched one is removed. */
export const MAX_AUTO_PACKS = 24;
/** A rule's characters are tried in table order; give up after this many failed downloads. */
const MAX_TRIES = 2;

/** The pack id `importSheet` gives a Petdex pet. */
export const packIdFor = (slug: string) => `petdex-${safeSlug(slug)}`;

interface Item<T> {
  get(): Promise<T>;
  set(v: T): Promise<void>;
}

export interface AutoMatchDeps {
  /** The user's opt-in. Nothing is matched or fetched while this is false. */
  enabled(): Promise<boolean>;
  rules: readonly MatchRule[];
  index: Item<MatchIndex | null>;
  /** Packs this feature downloaded → when they were last matched. */
  used: Item<Record<string, number>>;
  fetchManifest(): Promise<PetdexEntry[]>;
  /** Ids of imported packs (whoever imported them). */
  installed(): Promise<string[]>;
  /** Download and register one character; resolves to its pack id. */
  importPet(pet: PetRef): Promise<string>;
  removePack(id: string): Promise<void>;
  /** Packs that must stay (locked, or on screen right now). */
  pinned(): Promise<string[]>;
  now(): number;
}

/**
 * Turns "this content names a known character" into an installed pack id,
 * downloading the character from Petdex the first time it is needed.
 *
 * - A rule lists its characters most recognisable first, and the first one available wins.
 * - A character already imported (by this feature or by hand) is reused: no network.
 * - Otherwise the manifest is fetched at most once a day, the rule's first
 *   character is downloaded, and at most {@link MAX_AUTO_PACKS} downloads are kept.
 * - The title itself is never sent anywhere; Petdex only sees which sheet was requested.
 */
export class AutoMatcher {
  private readonly matcher: RuleMatcher;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: AutoMatchDeps) {
    this.matcher = new RuleMatcher(deps.rules);
  }

  /** Pack id of a character for this content, or null. Never rejects. */
  async match(info: Pick<MediaInfo, 'title' | 'artist'>): Promise<string | null> {
    return this.run(info, (rule) => rule.petdex);
  }

  /**
   * Another character for the same content ("换一次" on a matched character): the
   * rule's characters after `current`, wrapping around. Null when the rule has no other.
   */
  async alternative(info: Pick<MediaInfo, 'title' | 'artist'>, current: string): Promise<string | null> {
    return this.run(info, (rule) => {
      const i = rule.petdex.findIndex((s) => packIdFor(s) === current);
      const rotated = i < 0 ? rule.petdex : [...rule.petdex.slice(i + 1), ...rule.petdex.slice(0, i)];
      return rotated.filter((s) => packIdFor(s) !== current);
    });
  }

  private async run(
    info: Pick<MediaInfo, 'title' | 'artist'>,
    candidates: (rule: MatchRule) => readonly string[],
  ): Promise<string | null> {
    try {
      if (!(await this.deps.enabled())) return null;
      const rule = this.matcher.find(info);
      if (!rule) return null;
      const slugs = candidates(rule);
      if (!slugs.length) return null;
      // One at a time: imports and evictions read-modify-write the same pack list.
      const run = this.queue.then(() => this.resolve(slugs));
      this.queue = run.catch(() => {});
      return await run;
    } catch (e) {
      console.warn('[kobutai] character match failed', e);
      return null;
    }
  }

  /** The first of `slugs` that is installed; otherwise download the first one Petdex still has. */
  private async resolve(slugs: readonly string[]): Promise<string | null> {
    const installed = new Set(await this.deps.installed());
    const have = slugs.map(packIdFor).find((id) => installed.has(id));
    if (have) {
      await this.touch(have, false);
      return have;
    }

    const index = await this.freshIndex();
    const available = slugs.map((slug) => index.pets[slug]).filter((p): p is PetRef => !!p);
    for (const pet of available.slice(0, MAX_TRIES)) {
      try {
        const id = await this.deps.importPet(pet);
        await this.touch(id, true);
        await this.evict(id);
        return id;
      } catch (e) {
        console.warn('[kobutai] could not download matched character', pet.slug, e);
      }
    }
    return null;
  }

  /** Cached slice of the manifest; refreshed when stale, and kept when the refresh fails. */
  private async freshIndex(): Promise<MatchIndex> {
    const cached = await this.deps.index.get();
    if (cached && this.deps.now() - cached.at < INDEX_TTL_MS) return cached;
    try {
      const wanted = new Set(this.deps.rules.flatMap((r) => r.petdex));
      const pets: Record<string, PetRef> = {};
      for (const p of await this.deps.fetchManifest()) {
        if (!wanted.has(p.slug)) continue;
        pets[p.slug] = { slug: p.slug, displayName: p.displayName, submittedBy: p.submittedBy, spritesheetUrl: p.spritesheetUrl };
      }
      const next = { at: this.deps.now(), pets };
      await this.deps.index.set(next);
      return next;
    } catch (e) {
      if (cached) return cached;
      throw e;
    }
  }

  /** Record a match. Packs the user imported by hand are never tracked, so never evicted. */
  private async touch(id: string, imported: boolean): Promise<void> {
    const used = await this.deps.used.get();
    if (!imported && !(id in used)) return;
    await this.deps.used.set({ ...used, [id]: this.deps.now() });
  }

  private async evict(keep: string): Promise<void> {
    const used = { ...(await this.deps.used.get()) };
    const installed = new Set(await this.deps.installed());
    // Forget packs the user already deleted from the import page.
    for (const id of Object.keys(used)) if (!installed.has(id)) delete used[id];

    const pinned = new Set([keep, ...(await this.deps.pinned())]);
    const oldestFirst = Object.keys(used).sort((a, b) => used[a]! - used[b]!);
    for (const id of oldestFirst) {
      if (Object.keys(used).length <= MAX_AUTO_PACKS) break;
      if (pinned.has(id)) continue;
      await this.deps.removePack(id);
      delete used[id];
    }
    await this.deps.used.set(used);
  }
}

/** Resolve with `fallback` if `p` takes longer than `ms`; `p` keeps running. */
export function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      () => (clearTimeout(timer), resolve(fallback)),
    );
  });
}
