/**
 * Protocol between the isolated-world content script and the main-world hook
 * (entrypoints/media-hook.content.ts). Worlds share the DOM but not JS objects,
 * so state travels through <html> data attributes and commands through
 * CustomEvents carrying JSON strings.
 */
export const ATTR_ACTIONS = 'data-happydesk-actions';
export const ATTR_META = 'data-happydesk-meta';
export const ATTR_DETACHED = 'data-happydesk-detached';
export const CMD_EVENT = 'happydesk:cmd';
export const STATE_EVENT = 'happydesk:state';

export interface BridgeMeta {
  title: string;
  artist: string;
  album: string;
  artwork?: string;
}

/** State of a media element the page created but never attached to the DOM (e.g. Spotify). */
export interface DetachedState {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

export type BridgeCommand =
  | { target: 'session'; action: string; seekTime?: number }
  | { target: 'detached'; op: 'play' | 'pause' | 'seek' | 'volume' | 'mute'; value?: number };

export function readActions(doc: Document): Set<string> {
  const v = doc.documentElement.getAttribute(ATTR_ACTIONS);
  return new Set(v ? v.split(',').filter(Boolean) : []);
}

function readJson<T>(doc: Document, attr: string): T | null {
  const v = doc.documentElement.getAttribute(attr);
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export const readMeta = (doc: Document) => readJson<BridgeMeta>(doc, ATTR_META);
export const readDetached = (doc: Document) => readJson<DetachedState>(doc, ATTR_DETACHED);

export function sendBridgeCommand(doc: Document, cmd: BridgeCommand): void {
  doc.dispatchEvent(new CustomEvent(CMD_EVENT, { detail: JSON.stringify(cmd) }));
}

/** Largest artwork src from a MediaMetadata-like artwork list. */
export function pickArtwork(list: ReadonlyArray<{ src: string; sizes?: string }> | undefined): string | undefined {
  if (!list?.length) return undefined;
  let best = list[0]!;
  let bestSize = 0;
  for (const a of list) {
    const size = Math.max(0, ...(a.sizes ?? '').split(/\s+/).map((s) => parseInt(s, 10) || 0));
    if (size > bestSize) {
      best = a;
      bestSize = size;
    }
  }
  return best.src;
}
