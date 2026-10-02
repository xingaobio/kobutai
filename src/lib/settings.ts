import { storage } from '#imports';

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
  return {
    scale,
    x: Math.round(Math.min(Math.max(0, view.w - w), Math.max(0, l.x))),
    y: Math.round(Math.min(Math.max(0, view.h - h), Math.max(0, l.y))),
  };
}

export function defaultLayout(box: { w: number; h: number }, view: { w: number; h: number }): Layout {
  return clampLayout(
    { scale: DEFAULT_SCALE, x: view.w - box.w * DEFAULT_SCALE - 24, y: view.h - box.h * DEFAULT_SCALE - 24 },
    box,
    view,
  );
}
