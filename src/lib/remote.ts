import { blobRef } from './blobstore';
import type { LoadedPack, StateAsset } from './pack/types';
import { validatePack } from './pack/validate';

/**
 * Remote character libraries: an `index.json` listing pack folders next to it,
 * each with `pack.json` + assets. Everything is downloaded once into IndexedDB
 * (as `hdblob:` refs) so packs keep working offline.
 */
export const DEFAULT_LIBRARY = 'https://raw.githubusercontent.com/xingaobio/happydesk/main/library/index.json';
export const MAX_PACKS_PER_LIBRARY = 100;
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/;
// No SVG: it can't be decoded to an ImageBitmap for canvas drawing, and may carry script.
const ASSET_TYPES = /^(image\/(png|webp|gif|jpeg|avif)|video\/webm)\b/;

export interface RemoteIndex {
  packs: string[];
}

export function validateIndex(v: unknown): { ok: true; index: RemoteIndex } | { ok: false; error: string } {
  const packs = (v as { packs?: unknown })?.packs;
  if (!Array.isArray(packs)) return { ok: false, error: 'index.json: "packs" must be an array' };
  if (packs.length > MAX_PACKS_PER_LIBRARY) return { ok: false, error: `index.json: at most ${MAX_PACKS_PER_LIBRARY} packs` };
  const bad = packs.find((p) => typeof p !== 'string' || !ID_RE.test(p));
  if (bad !== undefined) return { ok: false, error: `index.json: invalid pack id ${JSON.stringify(bad)}` };
  return { ok: true, index: { packs: packs as string[] } };
}

/** Stable short key for an asset URL (FNV-1a, 2×32 bit). */
export function assetKey(url: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return `remote-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export interface SyncDeps {
  fetch: typeof fetch;
  putBlob(key: string, blob: Blob): Promise<void>;
}

export interface SyncResult {
  packs: LoadedPack[];
  errors: string[];
  /** Pack ids listed in the index that could not be downloaded this time. */
  failed: string[];
  /** Blob keys referenced by `packs` (everything else under remote-* can be collected). */
  keys: string[];
}

async function fetchJson(f: typeof fetch, url: string): Promise<unknown> {
  const res = await f(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchAsset(f: typeof fetch, url: string): Promise<Blob> {
  const res = await f(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_ASSET_BYTES) throw new Error(`${url} is larger than ${MAX_ASSET_BYTES / 1024 / 1024} MB`);
  const blob = await res.blob();
  if (blob.size > MAX_ASSET_BYTES) throw new Error(`${url} is larger than ${MAX_ASSET_BYTES / 1024 / 1024} MB`);
  // GitHub raw serves everything as text/plain; trust the extension in that case.
  const type = ASSET_TYPES.test(blob.type) ? blob.type : typeFromExt(url);
  if (!type) throw new Error(`${url}: unsupported asset type ${blob.type || '(none)'}`);
  return blob.type === type ? blob : new Blob([blob], { type });
}

function typeFromExt(url: string): string | null {
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    avif: 'image/avif', webm: 'video/webm',
  };
  return (ext && map[ext]) || null;
}

/** Download one library. Individual broken packs are skipped and reported; a broken index fails the whole library. */
export async function syncLibrary(indexUrl: string, deps: SyncDeps): Promise<SyncResult> {
  const errors: string[] = [];
  const keys: string[] = [];
  const failed: string[] = [];
  if (!/^https:\/\//.test(indexUrl)) return { packs: [], errors: [`${indexUrl}: only https libraries are allowed`], keys, failed };
  let index: RemoteIndex;
  try {
    const v = validateIndex(await fetchJson(deps.fetch, indexUrl));
    if (!v.ok) return { packs: [], errors: [v.error], keys, failed };
    index = v.index;
  } catch (e) {
    return { packs: [], errors: [`${indexUrl}: ${e instanceof Error ? e.message : e}`], keys, failed };
  }

  const packs: LoadedPack[] = [];
  for (const id of index.packs) {
    try {
      const base = new URL(`${id}/`, indexUrl).href;
      const r = validatePack(await fetchJson(deps.fetch, base + 'pack.json'));
      if (!r.ok) throw new Error(r.errors.join('; '));
      if (r.pack.id !== id) throw new Error(`pack.json id "${r.pack.id}" does not match folder "${id}"`);
      const stored = new Map<string, string>();
      const states: Record<string, StateAsset> = {};
      for (const [state, asset] of Object.entries(r.pack.states)) {
        if (!asset) continue;
        if (asset.src.startsWith('hdblob:')) throw new Error('remote packs cannot reference local assets');
        const url = new URL(asset.src, base).href;
        let ref = stored.get(url);
        if (!ref) {
          const key = assetKey(url);
          await deps.putBlob(key, await fetchAsset(deps.fetch, url));
          keys.push(key);
          ref = blobRef(key);
          stored.set(url, ref);
        }
        states[state] = { ...asset, src: ref };
      }
      packs.push({ ...r.pack, states: states as LoadedPack['states'], source: 'remote' });
    } catch (e) {
      failed.push(id);
      errors.push(`${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { packs, errors, keys, failed };
}
