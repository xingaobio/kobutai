import type { LoadedPack, PackManifest, StateAsset } from './types';
import { validatePack } from './validate';

export type FetchJson = (url: string) => Promise<unknown>;

export const defaultFetchJson: FetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

/** Resolve every asset `src` against the pack folder URL. */
export function resolvePack(pack: PackManifest, baseUrl: string, source: LoadedPack['source']): LoadedPack {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const states: Record<string, StateAsset> = {};
  for (const [name, asset] of Object.entries(pack.states)) {
    if (asset) states[name] = { ...asset, src: new URL(asset.src, base).href };
  }
  return { ...pack, states: states as LoadedPack['states'], source };
}

export interface PackIndex {
  packs: string[];
}

/**
 * Load every pack listed in `<rootUrl>/index.json`. Invalid packs are skipped and
 * reported through `onError` so a single broken pack never breaks the overlay.
 */
export async function loadPackIndex(
  rootUrl: string,
  source: LoadedPack['source'],
  fetchJson: FetchJson = defaultFetchJson,
  onError: (id: string, errors: string[]) => void = (id, e) => console.warn(`[happydesk] pack ${id}:`, e),
): Promise<LoadedPack[]> {
  const root = rootUrl.endsWith('/') ? rootUrl : rootUrl + '/';
  const index = (await fetchJson(root + 'index.json')) as Partial<PackIndex>;
  if (!Array.isArray(index?.packs)) throw new Error('index.json: "packs" must be an array');
  const results = await Promise.all(
    index.packs.map(async (id): Promise<LoadedPack | null> => {
      try {
        const base = new URL(`${encodeURIComponent(id)}/`, root).href;
        const r = validatePack(await fetchJson(base + 'pack.json'));
        if (!r.ok) {
          onError(id, r.errors);
          return null;
        }
        return resolvePack(r.pack, base, source);
      } catch (e) {
        onError(id, [String(e)]);
        return null;
      }
    }),
  );
  return results.filter((p): p is LoadedPack => p !== null);
}
