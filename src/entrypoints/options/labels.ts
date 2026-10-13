import type { LoadedPack } from '@/lib/pack/types';
import { t } from '@/lib/i18n/ui.svelte';
import { genreLabel, typeLabel } from '@/lib/ui/labels';

/** "Rock · Pop", or "Any genre" for the generic pool. */
export function poolLabel(p: Pick<LoadedPack, 'tags'>): string {
  const parts = p.tags.genre.length ? p.tags.genre.map(genreLabel) : p.tags.type.map(typeLabel);
  return parts.length ? parts.join(' · ') : t('pool.any');
}

/** The pastel behind each built-in character's photo (their own palette, softened). */
const PHOTO: Record<string, string> = {
  rina: '#FFD9DF', hoshiri: '#E7DCFF', qingge: '#DCEFE8', nei: '#D7F3FA', mochi: '#E3EFD9', popo: '#FFE1CC',
  kiki: '#FFF0BF', raku: '#FFE2C7', viola: '#DCE3F5', aria: '#FFD9EC', ouen: '#D6F5EA', tingting: '#E3EFD9',
};
export const photoColor = (id: string) => PHOTO[id] ?? '#EFE8F4';

/** Where an imported character came from. */
export function sourceLabel(p: LoadedPack, autoMatched: boolean): string {
  if (p.source === 'remote') return t('source.remote');
  if (p.source === 'builtin') return t('source.builtin');
  if (p.author?.includes('Petdex') || p.source === 'petdex') return autoMatched ? t('source.petdexAuto') : 'Petdex';
  return t('source.local');
}

/** "by Mika · CC BY 4.0" for characters other people drew and shared through the library. */
export function credit(p: LoadedPack): string | null {
  if (p.source !== 'remote' || !p.author || !p.license?.startsWith('CC BY')) return null;
  return [t('credit.by', { name: p.author }), p.license].filter(Boolean).join(' · ');
}
