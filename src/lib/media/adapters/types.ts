import type { DetachedState } from '../bridge';

export interface TrackInfo {
  title: string;
  artist: string;
  artwork: string;
}

/**
 * Site-specific knowledge layered on top of the generic controller. Every hook
 * is optional; anything an adapter leaves out falls back to generic behaviour.
 */
export interface SiteAdapter {
  id: string;
  match(host: string): boolean;
  /** The page's main media element, so previews/ads never win. */
  findMedia?(doc: Document): HTMLMediaElement | null;
  /** Never use in-DOM media found generically (e.g. Spotify's muted Canvas loops). */
  ignoreDomMedia?: boolean;
  info?(doc: Document, loc: Location): Partial<TrackInfo>;
  nextButton?(doc: Document): HTMLElement | null;
  prevButton?(doc: Document): HTMLElement | null;
  playPauseButton?(doc: Document): HTMLElement | null;
  /** Playback state read from the page UI, for players with no reachable media element. */
  domState?(doc: Document): DetachedState | null;
}

export function text(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
}

export function clickable(el: Element | null): HTMLElement | null {
  if (!(el instanceof HTMLElement)) return null;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;
  if (el.style.display === 'none' || el.hidden) return null;
  return el;
}

export function absUrl(src: string | null | undefined, base: string): string {
  if (!src) return '';
  try {
    return new URL(src.startsWith('//') ? 'https:' + src : src, base).href;
  } catch {
    return '';
  }
}

/** "1:02:03" / "3:45" → seconds. */
export function parseClock(s: string): number {
  const parts = s.trim().split(':').map((p) => parseInt(p, 10));
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
