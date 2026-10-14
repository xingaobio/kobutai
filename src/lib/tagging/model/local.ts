import type { MediaInfo, Tags } from '../types';
import { Classifier, type Classification, type ModelConfig } from './classifier';

/** Where the packaged model lives inside the extension (see public/model/). */
export const MODEL_FILES = {
  config: '/model/config.json',
  weights: '/model/kobutai.bin',
  artists: '/model/artists.tsv',
} as const;

/**
 * Hand an item to the AI model (when one is configured) below this combined confidence.
 * Measured on 383 real titles: the small model alone is fully right on 84%; handing off
 * the ~32% below 0.9 gives 95.6%, slightly better than asking the AI about everything.
 */
export const HANDOFF_CONFIDENCE = 0.9;

export type LocalTags = Tags & {
  /** How sure the local model is of the whole answer (type × genre or video class), 0..1. */
  confidence: number;
};

/** Combined confidence; 0 when the model abstained anywhere. */
export function confidenceOf(c: Classification): number {
  if (!c.type) return 0;
  if (c.type === 'music') return c.genre ? Math.min(c.typeConfidence, c.genreConfidence) : 0;
  if (c.type === 'video') return c.vclass ? Math.min(c.typeConfidence, c.vclassConfidence) : 0;
  return c.typeConfidence;
}

/**
 * Model answer → extension tags. Abstentions map to the generic pool:
 * no type → "other"; music without a confident genre → music with genre null.
 */
export function toTags(c: Classification): LocalTags {
  const confidence = confidenceOf(c);
  if (!c.type) return { type: 'other', genre: null, source: 'model', confidence };
  return {
    type: c.type,
    genre: c.type === 'music' ? c.genre : null,
    ...(c.type === 'video' && c.vclass ? { vclass: c.vclass } : {}),
    source: 'model',
    confidence,
  };
}

/**
 * Live-streaming sites. Players report live streams with duration 0 (unknown), so the model
 * would never see the "live" signal; on these hosts it chooses between live and a music stream.
 */
export const LIVE_HOSTS = [
  'live.bilibili.com',
  'twitch.tv',
  'kick.com',
  'live.douyin.com',
  'huya.com',
  'douyu.com',
  'live.nicovideo.jp',
  'openrec.tv',
  'twitcasting.tv',
  'showroom-live.com',
  '17.live',
];

export function isLiveHost(site: string): boolean {
  const host = site.toLowerCase();
  return LIVE_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

export function classifyInfo(clf: Classifier, info: MediaInfo): LocalTags {
  return toTags(
    clf.classify({
      title: info.title,
      artist: info.artist,
      source: info.site,
      duration: info.duration && info.duration > 0 ? info.duration : null,
      isLive: !!info.live || isLiveHost(info.site),
    }),
  );
}

export type ModelFile = (typeof MODEL_FILES)[keyof typeof MODEL_FILES];

export type FileFetcher = {
  json(path: ModelFile): Promise<unknown>;
  bytes(path: ModelFile): Promise<ArrayBuffer>;
  text(path: ModelFile): Promise<string>;
};

/** Reads the packaged files from the extension itself. */
export function extensionFetcher(url: (path: ModelFile) => string): FileFetcher {
  const get = async (path: ModelFile) => {
    const r = await fetch(url(path));
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r;
  };
  return {
    json: async (p) => (await get(p)).json(),
    bytes: async (p) => (await get(p)).arrayBuffer(),
    text: async (p) => (await get(p)).text(),
  };
}

/**
 * Loads the model once, on first use (about 2.6 MB from the extension package).
 * A failed load is remembered as null: callers fall back to the keyword rules.
 */
export class LocalModel {
  private loading: Promise<Classifier | null> | null = null;

  constructor(private readonly files: FileFetcher) {}

  load(): Promise<Classifier | null> {
    this.loading ??= Promise.all([
      this.files.json(MODEL_FILES.config),
      this.files.bytes(MODEL_FILES.weights),
      this.files.text(MODEL_FILES.artists),
    ])
      .then(([cfg, bin, tsv]) => Classifier.load(cfg as ModelConfig, bin, tsv))
      .catch((e: unknown) => {
        // Missing or corrupt files: warn once; the worker retries on its next start.
        console.warn('[kobutai] local model unavailable, using keyword rules:', e);
        return null;
      });
    return this.loading;
  }

  async tag(info: MediaInfo): Promise<LocalTags | null> {
    const clf = await this.load();
    return clf ? classifyInfo(clf, info) : null;
  }
}
