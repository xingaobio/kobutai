/**
 * Large pack assets (imported sprite sheets) live in the extension's IndexedDB.
 * Packs reference them as `hdblob:<key>`; content scripts can't open the
 * extension's IndexedDB, so they ask the background for a data URL.
 */
export const BLOB_SCHEME = 'hdblob:';
const DB = 'happydesk';
const STORE = 'blobs';

export const blobRef = (key: string) => `${BLOB_SCHEME}${key}`;
export const isBlobRef = (src: string) => src.startsWith(BLOB_SCHEME);
export const blobKey = (src: string) => src.slice(BLOB_SCHEME.length);

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const putBlob = (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key)).then(() => {});
export const getBlob = (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key));
export const deleteBlob = (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => {});
export const blobKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((k) => k.map(String));

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/** Small LRU of encoded data URLs so each tab doesn't re-encode a 2 MB sheet. */
export class DataUrlCache {
  private cache = new Map<string, Promise<string | null>>();
  constructor(
    private load: (key: string) => Promise<Blob | undefined>,
    private limit = 6,
  ) {}

  get(key: string): Promise<string | null> {
    let p = this.cache.get(key);
    if (p) {
      this.cache.delete(key);
    } else {
      p = this.load(key).then((b) => (b ? blobToDataUrl(b) : null));
      p.then((v) => v === null && this.cache.delete(key), () => this.cache.delete(key));
    }
    this.cache.set(key, p);
    while (this.cache.size > this.limit) this.cache.delete(this.cache.keys().next().value!);
    return p;
  }

  invalidate(key?: string): void {
    if (key === undefined) this.cache.clear();
    else this.cache.delete(key);
  }
}
