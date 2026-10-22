import { CONTENT_TYPES, GENRES, VIDEO_CLASSES, type ContentType, type Genre, type VideoClass } from '../pack/types';

/** What we know about a piece of content; only metadata, never page content. */
export interface MediaInfo {
  title: string;
  artist: string;
  site: string;
  /** Seconds, when the player knows it (0 or absent = unknown). Not part of the content key. */
  duration?: number;
  /** The player reports a live stream. Not part of the content key. */
  live?: boolean;
}

/**
 * How a song feels, for the character's lines (see lib/dialogue). Only the user's AI
 * model gives one; without it the mood comes from the genre.
 */
export const MUSIC_MOODS = ['calm', 'hype', 'bright', 'sad'] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];

export interface Tags {
  type: ContentType;
  /** Only meaningful for music; null otherwise. */
  genre: Genre | null;
  /** Only for video, when known: entertainment or explanatory. */
  vclass?: VideoClass;
  /** Only for music, only from the user's AI model. */
  mood?: MusicMood;
  /** rules = keyword rules, model = on-device classifier, ai / cache = the user's AI model. */
  source: 'rules' | 'model' | 'ai' | 'cache';
}

export function isTags(v: unknown): v is Omit<Tags, 'source'> {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (CONTENT_TYPES as readonly unknown[]).includes(o.type) &&
    (o.genre === null || (GENRES as readonly unknown[]).includes(o.genre)) &&
    (o.vclass === undefined || (VIDEO_CLASSES as readonly unknown[]).includes(o.vclass)) &&
    (o.mood === undefined || (MUSIC_MOODS as readonly unknown[]).includes(o.mood))
  );
}

/** Stable identity of one piece of content, used for caching and draw de-duplication. */
export function contentKey(info: MediaInfo): string {
  const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${norm(info.site)}|${norm(info.title)}|${norm(info.artist)}`;
}
