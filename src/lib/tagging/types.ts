import { CONTENT_TYPES, GENRES, type ContentType, type Genre } from '../pack/types';

/** What we know about a piece of content; only metadata, never page content. */
export interface MediaInfo {
  title: string;
  artist: string;
  site: string;
}

export interface Tags {
  type: ContentType;
  /** Only meaningful for music; null otherwise. */
  genre: Genre | null;
  source: 'rules' | 'ai' | 'cache';
}

export function isTags(v: unknown): v is Omit<Tags, 'source'> {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (CONTENT_TYPES as readonly unknown[]).includes(o.type) &&
    (o.genre === null || (GENRES as readonly unknown[]).includes(o.genre))
  );
}

/** Stable identity of one piece of content, used for caching and draw de-duplication. */
export function contentKey(info: MediaInfo): string {
  const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(info.site)}|${norm(info.title)}|${norm(info.artist)}`;
}
