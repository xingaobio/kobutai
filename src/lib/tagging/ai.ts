import Anthropic from '@anthropic-ai/sdk';
import { CONTENT_TYPES, GENRES } from '../pack/types';
import { isTags, type MediaInfo, type Tags } from './types';

export interface AiSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  /** Optional proxy / gateway base URL; empty = api.anthropic.com. */
  baseURL: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  apiKey: '',
  model: 'claude-opus-5-5',
  baseURL: '',
};

const NO_GENRE = 'none';

/** Structured-output schema: the model can only answer with these enums. */
export const TAG_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: [...CONTENT_TYPES] },
    genre: { type: 'string', enum: [...GENRES, NO_GENRE] },
  },
  required: ['type', 'genre'],
  additionalProperties: false,
} as const;

const SYSTEM = `You classify what a person is currently playing in their browser, from metadata only.
type: "music" (songs, MVs, covers, music mixes), "video" (any non-music video), "live" (a live stream), "podcast" (talk audio/shows), "other".
genre (only when type is "music", otherwise "${NO_GENRE}"): jpop, anime (anime/game songs, vocaloid, utaite), western-pop, hiphop, rock, electronic, classical, lofi, cpop (Mandarin/Cantonese pop), other.`;

export function aiClient(settings: AiSettings, fetchImpl?: typeof fetch): Anthropic {
  return new Anthropic({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || undefined,
    // The key is the user's own, stored only in this browser; there is no server to hide it behind.
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 10_000,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

/**
 * Ask Claude for tags. Sends only title / artist / site. Returns null on any
 * failure (network, refusal, invalid output) so callers fall back to rules.
 */
export async function aiTags(info: MediaInfo, settings: AiSettings, client = aiClient(settings)): Promise<Tags | null> {
  if (!settings.enabled || !settings.apiKey) return null;
  const metadata = { site: info.site, title: info.title, artist: info.artist };
  try {
    const res = await client.beta.messages.create({
      model: settings.model || DEFAULT_AI_SETTINGS.model,
      max_tokens: 256,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: TAG_SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(metadata) }],
    });
    if (res.stop_reason === 'refusal') return null;
    const text = res.content.find((b) => b.type === 'text')?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as { type: unknown; genre: unknown };
    const candidate = { type: parsed.type, genre: parsed.type === 'music' && parsed.genre !== NO_GENRE ? parsed.genre : null };
    if (!isTags(candidate)) return null;
    return { ...candidate, source: 'ai' };
  } catch (e) {
    console.warn('[happydesk] AI tagging failed, using rules:', e instanceof Error ? e.message : e);
    return null;
  }
}
