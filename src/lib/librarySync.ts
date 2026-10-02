import { blobKeys, deleteBlob, putBlob } from './blobstore';
import type { LoadedPack } from './pack/types';
import { syncLibrary } from './remote';
import { librarySyncLock, libraries, remotePacks, remoteSync, type RemoteSyncStatus } from './settings';

export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** After a failed sync (e.g. offline at first launch), try again sooner. */
export const RETRY_INTERVAL_MS = 30 * 60 * 1000;
/** A lock older than this belongs to a context that died mid-sync. */
const LOCK_TTL_MS = 2 * 60 * 1000;

let running: Promise<RemoteSyncStatus> | null = null;

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_TTL_MS;
  for (;;) {
    const held = await librarySyncLock.getValue();
    if (!held || Date.now() - held > LOCK_TTL_MS || Date.now() > deadline) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await librarySyncLock.setValue(Date.now());
  try {
    return await fn();
  } finally {
    await librarySyncLock.setValue(null);
  }
}

const blobKeysOf = (p: LoadedPack) =>
  Object.values(p.states).flatMap((a) => (a?.src.startsWith('hdblob:') ? [a.src.slice(7)] : []));

/**
 * Download every configured library. Anything that can't be downloaded this
 * time (a whole library or single packs) keeps its previous cached copy, so
 * going offline never removes characters. Removed libraries drop their packs.
 */
export function syncAllLibraries(): Promise<RemoteSyncStatus> {
  running ??= withLock(async () => {
    const urls = await libraries.getValue();
    const previous = await remotePacks.getValue();
    const packs: LoadedPack[] = [];
    const errors: string[] = [];
    let anyOk = false;
    for (const url of urls) {
      const r = await syncLibrary(url, { fetch, putBlob });
      errors.push(...r.errors);
      const old = previous.filter((p) => p.library === url);
      if (r.packs.length || !r.errors.length) {
        anyOk = true;
        packs.push(...r.packs.map((p) => ({ ...p, library: url })));
        // Packs that failed transiently keep their cached copy.
        packs.push(...old.filter((p) => r.failed.includes(p.id)));
      } else {
        // Whole library unreachable or broken: keep what we had from it.
        packs.push(...old);
      }
    }
    const status: RemoteSyncStatus = { at: Date.now(), ok: anyOk || !urls.length, errors, count: packs.length };
    await remotePacks.setValue(packs);
    await remoteSync.setValue(status);
    // Drop assets no remote pack references any more (imported petdex-* blobs are never touched).
    const keep = new Set(packs.flatMap(blobKeysOf));
    for (const k of await blobKeys()) if (k.startsWith('remote-') && !keep.has(k)) await deleteBlob(k);
    return status;
  }).finally(() => (running = null));
  return running;
}

export async function syncIfStale(): Promise<void> {
  const last = await remoteSync.getValue();
  const interval = last?.ok === false ? RETRY_INTERVAL_MS : SYNC_INTERVAL_MS;
  if (!last || Date.now() - last.at > interval) await syncAllLibraries();
}
