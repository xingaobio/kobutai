import { blobKeys, deleteBlob, putBlob } from './blobstore';
import type { LoadedPack } from './pack/types';
import { syncLibrary } from './remote';
import { libraries, remotePacks, remoteSync, type RemoteSyncStatus } from './settings';

export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

let running: Promise<RemoteSyncStatus> | null = null;

/**
 * Download every configured library. Packs from libraries that fail keep their
 * previous cached copy, so going offline never removes characters.
 */
export function syncAllLibraries(): Promise<RemoteSyncStatus> {
  running ??= (async () => {
    const startedAt = Date.now();
    const urls = await libraries.getValue();
    const previous = await remotePacks.getValue();
    const packs: LoadedPack[] = [];
    const errors: string[] = [];
    const keep = new Set<string>();
    let anyOk = false;
    for (const url of urls) {
      const r = await syncLibrary(url, { fetch, putBlob });
      errors.push(...r.errors);
      if (r.packs.length || !r.errors.length) {
        anyOk = true;
        packs.push(...r.packs.map((p) => ({ ...p, library: url })));
        r.keys.forEach((k) => keep.add(k));
      } else {
        // Whole library unreachable: keep what we had from it.
        const old = previous.filter((p) => p.library === url);
        packs.push(...old);
        for (const p of old) for (const a of Object.values(p.states)) if (a?.src.startsWith('hdblob:')) keep.add(a.src.slice(7));
      }
    }
    const status: RemoteSyncStatus = { at: Date.now(), ok: anyOk || !urls.length, errors, count: packs.length };
    // The options page and the background can both sync; a newer finished sync wins.
    const latest = await remoteSync.getValue();
    if (latest && latest.at > startedAt) return latest;
    await remotePacks.setValue(packs);
    await remoteSync.setValue(status);
    // Drop assets no remote pack references any more.
    for (const k of await blobKeys()) if (k.startsWith('remote-') && !keep.has(k)) await deleteBlob(k);
    return status;
  })().finally(() => (running = null));
  return running;
}

export async function syncIfStale(): Promise<void> {
  const last = await remoteSync.getValue();
  if (!last || Date.now() - last.at > SYNC_INTERVAL_MS) await syncAllLibraries();
}
