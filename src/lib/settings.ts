import type { EncoreRate } from './emoji/encore';
import type { BubbleStyle } from './emoji/kaomoji';
import type { ShowWhen } from './ui/presence';
import { storage } from '#imports';
import type { GachaState } from './gacha/engine';
import type { LoadedPack } from './pack/types';
import type { RegistryMeta } from './registry';
import type { Credential } from '@earendil-works/pi-ai';
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from './llm/config';
import type { MatchIndex } from './match/auto';
import { DEFAULT_LIBRARY } from './remote';
import type { TagCacheStore } from './tagging/tagger';

export interface Layout {
  /** Left/top of the overlay in CSS px, relative to the viewport. */
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2;
/** About 150 px tall for the built-in characters (208 px cells, the character fills ~85%). */
export const DEFAULT_SCALE = 0.85;

export const hiddenSites = storage.defineItem<string[]>('local:hiddenSites', { fallback: [] });

/**
 * Per-site position and size. "layout2": sizes saved for the old wide placeholder
 * characters made the slim new ones too small, so those saved layouts start over once.
 */
export function layoutKey(host: string): `local:${string}` {
  return `local:layout2:${host}`;
}

export async function getLayout(host: string): Promise<Layout | null> {
  return storage.getItem<Layout>(layoutKey(host));
}

export async function setLayout(host: string, layout: Layout): Promise<void> {
  await storage.setItem(layoutKey(host), layout);
}

export async function isSiteHidden(host: string): Promise<boolean> {
  return (await hiddenSites.getValue()).includes(host);
}

export async function setSiteHidden(host: string, hidden: boolean): Promise<void> {
  const list = await hiddenSites.getValue();
  const next = hidden ? [...new Set([...list, host])] : list.filter((h) => h !== host);
  await hiddenSites.setValue(next);
}

/** Keep the overlay box fully inside the viewport. */
export function clampLayout(l: Layout, box: { w: number; h: number }, view: { w: number; h: number }): Layout {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, l.scale));
  const w = box.w * scale;
  const h = box.h * scale;
  const maxX = Math.max(0, Math.floor(view.w - w));
  const maxY = Math.max(0, Math.floor(view.h - h));
  return {
    scale,
    x: Math.min(maxX, Math.max(0, Math.round(l.x))),
    y: Math.min(maxY, Math.max(0, Math.round(l.y))),
  };
}

export function defaultLayout(box: { w: number; h: number }, view: { w: number; h: number }): Layout {
  return clampLayout(
    { scale: DEFAULT_SCALE, x: view.w - box.w * DEFAULT_SCALE - 24, y: view.h - box.h * DEFAULT_SCALE - 24 },
    box,
    view,
  );
}

// --- M2: gacha / AI / collection ---------------------------------------------

/** Model choice for AI tagging: local only, never synced. */
export const llmSettings = storage.defineItem<LlmSettings>('local:llmSettings', { fallback: DEFAULT_LLM_SETTINGS });
/** API keys and subscription tokens, per pi-ai provider id. Local only, never synced. */
export const llmCredentials = storage.defineItem<Record<string, Credential>>('local:llmCredentials', { fallback: {} });
/** Stable per-install id some sign-ins (ChatGPT) require. */
export const installId = storage.defineItem<string>('local:installId', { init: () => crypto.randomUUID() });

/** Settings from before multi-provider support (Anthropic key only). */
interface LegacyAiSettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  baseURL: string;
}

/** One-time move of the old Anthropic-only settings to a provider credential + model choice. */
export async function migrateLegacyAi(): Promise<void> {
  const old = await storage.getItem<LegacyAiSettings>('local:aiSettings');
  if (!old) return;
  if (old.apiKey && !(await storage.getItem('local:llmSettings'))) {
    const proxy = old.baseURL.trim();
    const model = old.model || 'claude-haiku-4-5';
    const provider = proxy ? 'custom-anthropic-proxy' : 'anthropic';
    await llmCredentials.setValue({ ...(await llmCredentials.getValue()), [provider]: { type: 'api_key', key: old.apiKey } });
    await llmSettings.setValue({
      enabled: old.enabled,
      provider,
      model,
      custom: proxy
        ? [{ id: provider, name: 'Anthropic 代理', baseUrl: proxy, api: 'anthropic-messages', models: [model] }]
        : [],
    });
  }
  await storage.removeItem('local:aiSettings');
}

export const tagCache = storage.defineItem<Awaited<ReturnType<TagCacheStore['get']>>>('local:tagCache', {
  fallback: {},
});

/** Pinned character id, synced across the user's browsers. */
export const lockedPack = storage.defineItem<string | null>('sync:lockedPack', { fallback: null });

export interface CollectionEntry {
  /** Times drawn. */
  n: number;
  /** First drawn (ms epoch). */
  first: number;
}

/**
 * 图鉴: pack id → stats. Kept in local storage: sync storage caps one item at
 * 8 KB (~160 packs), which Petdex imports can exceed.
 */
export const collection = storage.defineItem<Record<string, CollectionEntry>>('local:collection', { fallback: {} });

export async function recordDraw(packId: string, now = Date.now()): Promise<void> {
  const all = await collection.getValue();
  const prev = all[packId];
  await collection.setValue({ ...all, [packId]: { n: (prev?.n ?? 0) + 1, first: prev?.first ?? now } });
}

/** Imported packs (e.g. from Petdex) with assets inlined as data URLs. */
export const userPacks = storage.defineItem<LoadedPack[]>('local:userPacks', { fallback: [] });

/**
 * Ids of built-in and library characters the user deleted from the 图鉴. Those ship with
 * the extension (or come back on the next library sync), so they are left out of the
 * catalog instead of erased, and can be restored. Imported characters are really deleted.
 */
export const removedPacks = storage.defineItem<string[]>('local:removedPacks', { fallback: [] });

/** Current draw + recent draws; session storage survives service-worker restarts. */
export const gachaState = storage.defineItem<GachaState | null>('session:gachaState', { fallback: null });

/** Media start order + manual pick; survives service-worker restarts. */
export const registryMeta = storage.defineItem<RegistryMeta | null>('session:registryMeta', { fallback: null });

// --- M3: remote libraries ------------------------------------------------------

/** index.json URLs of remote character libraries. */
export const libraries = storage.defineItem<string[]>('local:libraries', { fallback: [DEFAULT_LIBRARY] });

/** Packs downloaded from libraries (assets in IndexedDB); kept when offline. */
export const remotePacks = storage.defineItem<LoadedPack[]>('local:remotePacks', { fallback: [] });

export interface RemoteSyncStatus {
  /** Last attempt (ms epoch). */
  at: number;
  ok: boolean;
  errors: string[];
  count: number;
}
export const remoteSync = storage.defineItem<RemoteSyncStatus | null>('local:remoteSync', { fallback: null });

/** Cross-context lock (background vs options page) so two syncs never interleave downloads and GC. */
export const librarySyncLock = storage.defineItem<number | null>('session:librarySyncLock', { fallback: null });

// --- Direct character matching (lib/match) ---------------------------------------

/** When the character is on screen: only around playback (default), or on every page. */
export const showWhen = storage.defineItem<ShowWhen>('local:showWhen', { fallback: 'playing' });

/** What the bubble shows: animated emoji, kaomoji (颜文字), or both mixed (default). */
export const bubbleStyle = storage.defineItem<BubbleStyle>('local:bubbleStyle', { fallback: 'mix' });

/** How often a long play gets a new bubble or a little action from the same character. */
export const encoreRate = storage.defineItem<EncoreRate>('local:encoreRate', { fallback: 'often' });

/** The bubble next to the character (bundled Noto emoji and kaomoji, no network). On by default. */
export const emojiBubbles = storage.defineItem<boolean>('local:emojiBubbles', { fallback: true });

/** Opt-in: show the character a title names (downloads it from Petdex). Off by default. */
export const autoMatch = storage.defineItem<boolean>('local:autoMatch', { fallback: false });
/** The name the user signs shared characters with, remembered for next time. */
export const shareAuthor = storage.defineItem<string>('local:shareAuthor', { fallback: '' });

/** The part of the Petdex manifest the match rules refer to; refreshed at most daily. */
export const matchIndex = storage.defineItem<MatchIndex | null>('local:matchIndex', { fallback: null });

/** Packs downloaded by matching → last matched (ms). Used to keep only the most recent ones. */
export const autoMatched = storage.defineItem<Record<string, number>>('local:autoMatched', { fallback: {} });
