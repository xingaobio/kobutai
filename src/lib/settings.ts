import { storage } from '#imports';
import type { GachaState } from './gacha/engine';
import type { LoadedPack } from './pack/types';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './tagging/ai';
import type { TagCacheStore } from './tagging/tagger';

export interface Layout {
  /** Left/top of the overlay in CSS px, relative to the viewport. */
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2;
export const DEFAULT_SCALE = 0.6;

export const hiddenSites = storage.defineItem<string[]>('local:hiddenSites', { fallback: [] });

export function layoutKey(host: string): `local:${string}` {
  return `local:layout:${host}`;
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

/** AI settings incl. the user's own API key: local only, never synced. */
export const aiSettings = storage.defineItem<AiSettings>('local:aiSettings', { fallback: DEFAULT_AI_SETTINGS });

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

/** Current draw + recent draws; session storage survives service-worker restarts. */
export const gachaState = storage.defineItem<GachaState | null>('session:gachaState', { fallback: null });
