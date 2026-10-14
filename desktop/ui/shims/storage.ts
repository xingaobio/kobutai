/**
 * The subset of WXT's `storage` API that src/ uses (settings.ts, i18n/core.ts), backed by
 * `localStorage` instead of `chrome.storage`. Semantics follow @wxt-dev/storage 1.x:
 *
 * - `local:` and `sync:` keys persist in localStorage as JSON; `session:` keys live in memory.
 * - Reading returns `value ?? fallback ?? null`; writing null/undefined removes the key.
 * - `init` runs once, when no value is stored yet, and its result is persisted.
 * - `watch` fires only when the value really changed. Writes in this window notify right after
 *   the write; writes from another window arrive through the `storage` event.
 * - The item-level `watch` reports `value ?? fallback`, the driver-level one reports `null`.
 */

export type StorageArea = 'local' | 'sync' | 'session';
export type StorageItemKey = `${StorageArea}:${string}`;

export interface StorageItemOptions<T> {
  fallback?: T;
  init?: () => T | Promise<T>;
}

export interface StorageItem<T> {
  readonly key: StorageItemKey;
  readonly fallback: T;
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
  removeValue(): Promise<void>;
  /** Returns the function that stops watching. */
  watch(cb: (newValue: T, oldValue: T) => void): () => void;
}

type Listener = (newValue: unknown, oldValue: unknown) => void;

/** Where `local:`/`sync:` values go: the Web Storage API subset we need. */
export type WebStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface StorageEnv {
  /** `null`: persistent storage is unavailable, so `local:` and `sync:` behave like `session:`. */
  persistent: WebStorageLike | null;
  /** Receives the `storage` events other windows cause. */
  events?: Pick<Window, 'addEventListener'>;
}

const AREAS: readonly string[] = ['local', 'sync', 'session'];

/** Structural equality for JSON values (WXT uses dequal/lite for the same check). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a !== a && b !== b;
}

/** What chrome.storage would hand back: a detached copy that survived JSON. */
function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Typed like WXT's: a fallback or an `init` means the value is never null. */
interface DefineItem {
  <T>(key: StorageItemKey): StorageItem<T | null>;
  <T>(key: StorageItemKey, opts: { fallback: T; init?: () => T | Promise<T> }): StorageItem<T>;
  <T>(key: StorageItemKey, opts: { init: () => T | Promise<T>; fallback?: T }): StorageItem<T>;
}

export function createStorage(env: StorageEnv) {
  const memory = new Map<string, string>();
  const listeners = new Map<string, Set<Listener>>();

  function resolve(key: string): { area: StorageArea; name: string } {
    const i = key.indexOf(':');
    const area = key.slice(0, i);
    if (i < 0 || !AREAS.includes(area)) {
      throw new Error(`Invalid storage key "${key}". Use "local:", "sync:" or "session:" followed by a name.`);
    }
    return { area: area as StorageArea, name: key };
  }

  const backend = (area: StorageArea) => (area === 'session' || !env.persistent ? null : env.persistent);

  function readRaw(key: string): string | null {
    const b = backend(resolve(key).area);
    if (!b) return memory.get(key) ?? null;
    try {
      return b.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  }

  function writeRaw(key: string, raw: string | null): void {
    const b = backend(resolve(key).area);
    if (!b) {
      if (raw === null) memory.delete(key);
      else memory.set(key, raw);
      return;
    }
    try {
      if (raw === null) b.removeItem(key);
      else b.setItem(key, raw);
    } catch (e) {
      // Quota or a blocked store: keep the value for this run rather than losing the write.
      console.warn(`[kobutai] could not persist "${key}":`, e);
      if (raw === null) memory.delete(key);
      else memory.set(key, raw);
    }
  }

  function parse(key: string, raw: string | null): unknown {
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      console.warn(`[kobutai] ignoring unreadable value for "${key}"`);
      return null;
    }
  }

  const read = (key: string): unknown => parse(key, readRaw(key));

  function notify(key: string, newValue: unknown, oldValue: unknown): void {
    if (jsonEqual(newValue, oldValue)) return;
    for (const cb of [...(listeners.get(key) ?? [])]) {
      try {
        cb(newValue ?? null, oldValue ?? null);
      } catch (e) {
        console.error('[kobutai] storage watcher failed', e);
      }
    }
  }

  function write(key: string, value: unknown): void {
    const old = read(key);
    if (value === null || value === undefined) writeRaw(key, null);
    else writeRaw(key, JSON.stringify(value));
    notify(key, read(key), old);
  }

  // Another window wrote a persistent key.
  env.events?.addEventListener('storage', (ev) => {
    const e = ev as StorageEvent;
    if (e.storageArea && env.persistent && e.storageArea !== (env.persistent as unknown)) return;
    // `key === null` (storage.clear() in another window) is not supported: nothing here clears.
    if (e.key === null || !listeners.has(e.key) || !backend(resolve(e.key).area)) return;
    notify(e.key, parse(e.key, e.newValue), parse(e.key, e.oldValue));
  });

  function watch(key: string, cb: Listener): () => void {
    resolve(key);
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  /** WXT serialises `init` per item; so does this. */
  function defineItem<T>(key: StorageItemKey, opts: StorageItemOptions<T> = {}): StorageItem<T> {
    resolve(key);
    const fallback = (opts.fallback ?? null) as T;
    let initLock: Promise<unknown> = Promise.resolve();
    const getOrInit = (): Promise<T> => {
      const run = initLock.then(async () => {
        const stored = read(key);
        if (stored !== null || !opts.init) return (stored ?? fallback) as T;
        const created = await opts.init();
        write(key, created);
        return clone(created);
      });
      initLock = run.catch(() => {});
      return run;
    };
    return {
      key,
      get fallback() {
        return clone(fallback);
      },
      getValue: () => getOrInit(),
      setValue: async (value) => write(key, value),
      removeValue: async () => write(key, null),
      watch: (cb) => watch(key, (n, o) => cb((n ?? clone(fallback)) as T, (o ?? clone(fallback)) as T)),
    };
  }

  return {
    defineItem: defineItem as DefineItem,
    getItem: async <T>(key: StorageItemKey, opts?: { fallback?: T }): Promise<T | null> =>
      (read(key) ?? opts?.fallback ?? null) as T | null,
    setItem: async <T>(key: StorageItemKey, value: T | null): Promise<void> => write(key, value),
    removeItem: async (key: StorageItemKey): Promise<void> => write(key, null),
    watch: (key: StorageItemKey, cb: (newValue: unknown, oldValue: unknown) => void): (() => void) => watch(key, cb),
  };
}

export type DesktopStorage = ReturnType<typeof createStorage>;

function persistentStore(): WebStorageLike | null {
  try {
    const ls = globalThis.localStorage;
    // Some webviews throw on first access when site data is blocked.
    ls.getItem('kobutai:probe');
    return ls;
  } catch {
    return null;
  }
}

/** The app's storage: localStorage plus cross-window `storage` events. */
export const storage = createStorage({
  persistent: persistentStore(),
  events: typeof addEventListener === 'function' ? globalThis : undefined,
});
