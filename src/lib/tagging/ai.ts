import { t } from '../i18n/core';
import { StringEnum, Type, clampThinkingLevel, type Models, type Tool } from '@earendil-works/pi-ai';
import { CONTENT_TYPES, GENRES, VIDEO_CLASSES } from '../pack/types';
import { MUSIC_MOODS, isTags, type MediaInfo, type Tags } from './types';

const NO_GENRE = 'none';

/** The model answers by calling this tool; its enums are the only allowed values. */
export const TAG_TOOL: Tool = {
  name: 'set_tags',
  description: 'Record what is playing.',
  parameters: Type.Object(
    {
      type: StringEnum([...CONTENT_TYPES]),
      genre: StringEnum([...GENRES, NO_GENRE]),
      vclass: Type.Optional(StringEnum([...VIDEO_CLASSES, NO_GENRE])),
      // Only picks which prepared lines the character says; the model never writes them.
      mood: Type.Optional(StringEnum([...MUSIC_MOODS, NO_GENRE])),
    },
    { additionalProperties: false },
  ),
  constrainedSampling: { type: 'json_schema', strict: 'prefer' },
};

const SYSTEM = `You classify what a person is currently playing in their browser, from metadata only.
type: "music" (songs, MVs, covers, music mixes), "video" (any non-music video), "live" (a live stream), "podcast" (talk audio/shows), "other".
genre (only when type is "music", otherwise "${NO_GENRE}"): jpop, anime (anime/game songs, vocaloid, utaite), western-pop, hiphop, rock, electronic, classical, lofi, cpop (Mandarin/Cantonese pop), other.
vclass (only when type is "video", otherwise "${NO_GENRE}"): ent (games, comedy, vlogs, film/anime clips, memes, sports) or info (tutorials, explainers, news, reviews, lectures, documentaries).
mood (only when type is "music", otherwise "${NO_GENRE}"): how the track feels: calm (slow, soothing), hype (fast, intense), bright (cheerful, upbeat), sad (melancholic ballad); "${NO_GENRE}" when unsure.
Answer by calling ${TAG_TOOL.name} exactly once.`;

export interface ModelRef {
  provider: string;
  model: string;
}

export type ClassifyResult = { ok: true; tags: Tags } | { ok: false; error: string };

function fromText(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Ask the configured model for tags. Sends only title / artist / site.
 * Never throws: failures come back as `{ ok: false, error }`.
 */
export async function classify(
  info: MediaInfo,
  ref: ModelRef,
  models: Models,
  timeoutMs = 15_000,
): Promise<ClassifyResult> {
  const model = models.getModel(ref.provider, ref.model);
  if (!model) return { ok: false, error: t('err.noModel', { model: `${ref.provider}/${ref.model}` }) };
  const metadata = { site: info.site, title: info.title, artist: info.artist };
  // Tagging needs no deliberation: think as little as the model allows.
  const level = model.reasoning ? clampThinkingLevel(model, 'minimal') : 'off';
  try {
    const msg = await models.completeSimple(
      model,
      {
        systemPrompt: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(metadata), timestamp: Date.now() }],
        tools: [TAG_TOOL],
      },
      { maxTokens: 1024, signal: AbortSignal.timeout(timeoutMs), ...(level !== 'off' ? { reasoning: level } : {}) },
    );
    if (msg.stopReason === 'error' || msg.stopReason === 'aborted')
      return { ok: false, error: msg.errorMessage || msg.stopReason };
    const call = msg.content.find((b) => b.type === 'toolCall' && b.name === TAG_TOOL.name);
    const raw =
      call?.type === 'toolCall'
        ? call.arguments
        : fromText(msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''));
    const r = (raw ?? {}) as { type?: unknown; genre?: unknown; vclass?: unknown; mood?: unknown };
    const candidate = {
      type: r.type,
      genre: r.type === 'music' && r.genre !== NO_GENRE ? r.genre : null,
      ...(r.type === 'video' && (VIDEO_CLASSES as readonly unknown[]).includes(r.vclass) ? { vclass: r.vclass } : {}),
      // Anything but one of the four moods is dropped: the lines then follow the genre.
      ...(r.type === 'music' && (MUSIC_MOODS as readonly unknown[]).includes(r.mood) ? { mood: r.mood } : {}),
    };
    if (!isTags(candidate)) return { ok: false, error: t('err.badAnswer') };
    return { ok: true, tags: { ...candidate, source: 'ai' } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** `classify` for the tagger: null on any failure so callers fall back to rules. */
export async function aiTags(info: MediaInfo, ref: ModelRef, models: Models): Promise<Tags | null> {
  const r = await classify(info, ref, models);
  if (r.ok) return r.tags;
  console.warn('[kobutai] AI tagging failed, using rules:', r.error);
  return null;
}
