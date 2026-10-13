export const STATE_NAMES = ['idle', 'playing', 'paused', 'appear', 'click', 'error'] as const;
export type StateName = (typeof STATE_NAMES)[number];

export const CONTENT_TYPES = ['music', 'video', 'live', 'podcast', 'other'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const GENRES = [
  'jpop',
  'anime',
  'western-pop',
  'hiphop',
  'rock',
  'electronic',
  'classical',
  'lofi',
  'cpop',
  'other',
] as const;
export type Genre = (typeof GENRES)[number];

/** Kind of non-music video: entertainment (games, comedy, vlogs…) or explanatory (tutorials, news…). */
export const VIDEO_CLASSES = ['ent', 'info'] as const;
export type VideoClass = (typeof VIDEO_CLASSES)[number];

export interface SpriteAsset {
  kind: 'sprite';
  src: string;
  frames: number;
  cols: number;
  /** Row of the sheet the animation starts on (default 0). Used for multi-state atlases. */
  row?: number;
  fps: number;
  loop?: boolean;
}

export interface VideoAsset {
  kind: 'video';
  src: string;
  loop?: boolean;
}

export type StateAsset = SpriteAsset | VideoAsset;

export interface PackTags {
  /** Empty array = matches any content type. */
  type: ContentType[];
  /** Empty array = generic pool. */
  genre: Genre[];
  /**
   * Optional: which kinds of video this character is for. Among the characters made for videos,
   * the ones that list the current video's kind are preferred; absent = any video.
   */
  vclass?: VideoClass[];
}

export interface PackManifest {
  id: string;
  name: string;
  author?: string;
  license?: string;
  tags: PackTags;
  size: { w: number; h: number };
  states: Partial<Record<StateName, StateAsset>> & { idle: StateAsset };
}

/** A manifest whose asset `src` fields have been resolved to absolute URLs. */
export interface LoadedPack extends PackManifest {
  source: 'builtin' | 'petdex' | 'remote' | 'user';
  /** For remote packs: the index.json they came from. */
  library?: string;
}

export function assetFor(pack: PackManifest, state: StateName): StateAsset {
  if (state === 'error') return pack.states.error ?? pack.states.paused ?? pack.states.idle;
  return pack.states[state] ?? pack.states.idle;
}
