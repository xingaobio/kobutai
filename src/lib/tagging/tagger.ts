import { isConfigured, type LlmSettings } from '../llm/config';
import { HANDOFF_CONFIDENCE, type LocalTags } from './model/local';
import { ruleTags } from './rules';
import { contentKey, type MediaInfo, type Tags } from './types';

type CachedTags = { type: Tags['type']; genre: Tags['genre']; vclass?: Tags['vclass']; at: number };

export interface TagCacheStore {
  get(): Promise<Record<string, CachedTags>>;
  set(v: Record<string, CachedTags>): Promise<void>;
}

/** The on-device classifier; resolves null when it isn't available (keyword rules are used instead). */
export type LocalTagger = (info: MediaInfo) => Promise<LocalTags | null>;

export const TAG_CACHE_LIMIT = 500;
export const AI_WAIT_MS = 6000;

/**
 * On-device classifier first; the user's AI model only for what it isn't sure about.
 *
 * 1. The local model answers (keyword rules if it can't load).
 * 2. No AI configured → that answer.
 * 3. An AI answer already cached for this content → the cached answer.
 * 4. The local model is confident (≥ HANDOFF_CONFIDENCE) → its answer, no request.
 * 5. Otherwise ask the AI. Its answers are cached per content so each song costs at most one
 *    request; slow answers fall back to step 1 but still land in the cache for next time.
 */
export class Tagger {
  constructor(
    private readonly settings: () => Promise<LlmSettings>,
    private readonly cache: TagCacheStore,
    private readonly ai: (info: MediaInfo, s: LlmSettings) => Promise<Tags | null>,
    private readonly waitMs = AI_WAIT_MS,
    private readonly local: LocalTagger = async () => null,
  ) {}

  async tag(info: MediaInfo): Promise<Tags> {
    const local = await this.local(info).catch((e: unknown) => {
      console.warn('[kobutai] local model failed, using keyword rules:', e);
      return null;
    });
    const fallback: Tags = local ? withoutConfidence(local) : ruleTags(info);
    const s = await this.settings();
    if (!isConfigured(s)) return fallback;

    // An answer the user's AI already gave (possibly before the local model existed) wins.
    const key = contentKey(info);
    const hit = (await this.cache.get())[key];
    if (hit) return withLocalKind({ type: hit.type, genre: hit.genre, ...(hit.vclass ? { vclass: hit.vclass } : {}), source: 'cache' }, local);
    if (local && local.confidence >= HANDOFF_CONFIDENCE) return fallback;

    const pending = this.ai(info, s).then(async (t) => {
      if (t) await this.remember(key, t);
      return t;
    });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), this.waitMs));
    const answer = await Promise.race([pending, timeout]);
    return answer ? withLocalKind(answer, local) : fallback;
  }

  private async remember(key: string, t: Tags): Promise<void> {
    const entry: CachedTags = { type: t.type, genre: t.genre, ...(t.vclass ? { vclass: t.vclass } : {}), at: Date.now() };
    const all = { ...(await this.cache.get()), [key]: entry };
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

function withoutConfidence({ confidence: _c, ...tags }: LocalTags): Tags {
  return tags;
}

/** AI answers may omit the video kind (old cache entries, providers that skip optional fields). */
function withLocalKind(t: Tags, local: LocalTags | null): Tags {
  if (t.type !== 'video' || t.vclass || !local || local.type !== 'video' || !local.vclass) return t;
  return { ...t, vclass: local.vclass };
}
