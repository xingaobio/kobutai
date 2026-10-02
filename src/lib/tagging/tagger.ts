import type { AiSettings } from './ai';
import { ruleTags } from './rules';
import { contentKey, type MediaInfo, type Tags } from './types';

export interface TagCacheStore {
  get(): Promise<Record<string, { type: Tags['type']; genre: Tags['genre']; at: number }>>;
  set(v: Record<string, { type: Tags['type']; genre: Tags['genre']; at: number }>): Promise<void>;
}

export const TAG_CACHE_LIMIT = 500;
export const AI_WAIT_MS = 6000;

/**
 * Rules first, AI when configured. AI answers are cached per content so each
 * song costs at most one request; slow answers still land in the cache for next time.
 */
export class Tagger {
  constructor(
    private readonly settings: () => Promise<AiSettings>,
    private readonly cache: TagCacheStore,
    private readonly ai: (info: MediaInfo, s: AiSettings) => Promise<Tags | null>,
    private readonly waitMs = AI_WAIT_MS,
  ) {}

  async tag(info: MediaInfo): Promise<Tags> {
    const rules = ruleTags(info);
    const s = await this.settings();
    if (!s.enabled || !s.apiKey) return rules;

    const key = contentKey(info);
    const hit = (await this.cache.get())[key];
    if (hit) return { type: hit.type, genre: hit.genre, source: 'cache' };

    const pending = this.ai(info, s).then(async (t) => {
      if (t) await this.remember(key, t);
      return t;
    });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), this.waitMs));
    return (await Promise.race([pending, timeout])) ?? rules;
  }

  private async remember(key: string, t: Tags): Promise<void> {
    const all = { ...(await this.cache.get()), [key]: { type: t.type, genre: t.genre, at: Date.now() } };
    const keys = Object.keys(all);
    if (keys.length > TAG_CACHE_LIMIT) {
      keys
        .sort((a, b) => all[a]!.at - all[b]!.at)
        .slice(0, keys.length - TAG_CACHE_LIMIT)
        .forEach((k) => delete all[k]);
    }
    await this.cache.set(all);
  }
}
