import type { DrawView } from '../gacha/engine';
import type { MessageKey } from '../i18n/core';
import { t } from '../i18n/ui.svelte';

const GENRES = ['jpop', 'anime', 'western-pop', 'hiphop', 'rock', 'electronic', 'classical', 'lofi', 'cpop', 'other'] as const;
const TYPES = ['music', 'video', 'live', 'podcast', 'other'] as const;

export const genreLabel = (g: string): string =>
  (GENRES as readonly string[]).includes(g) ? t(`genre.${g}` as MessageKey) : g;
export const typeLabel = (x: string): string => ((TYPES as readonly string[]).includes(x) ? t(`type.${x}` as MessageKey) : x);

/** What the content was recognised as: "Rock", "Video"… */
export function tagText(draw: Pick<DrawView, 'tags'>): string {
  return draw.tags.genre ? genreLabel(draw.tags.genre) : typeLabel(draw.tags.type);
}

/**
 * The small label next to the character's name, saying how it was chosen:
 * "AI · Rock" (a model recognised the genre), "matched by title" (the title names
 * the character), plain "Rock" (local rules), or "Locked".
 */
export function drawBadge(draw: DrawView | null): { text: string; kind: 'ai' | 'match' | 'rules' | 'locked' } | null {
  if (!draw) return null;
  if (draw.locked) return { text: t('badge.locked'), kind: 'locked' };
  if (draw.matched) return { text: t('badge.match'), kind: 'match' };
  if (draw.tags.source === 'ai') return { text: t('badge.ai', { tag: tagText(draw) }), kind: 'ai' };
  return { text: tagText(draw), kind: 'rules' };
}
