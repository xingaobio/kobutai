import type { Credential, CredentialInfo, CredentialStore } from '@earendil-works/pi-ai';

export type CredentialMap = Record<string, Credential>;

export interface MapItem {
  getValue(): Promise<CredentialMap>;
  setValue(v: CredentialMap): Promise<void>;
}

/** In-context fallback when the Web Locks API is missing (tests). */
const chains = new Map<string, Promise<unknown>>();
function localLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const run = (chains.get(name) ?? Promise.resolve()).then(fn, fn);
  chains.set(
    name,
    run.catch(() => undefined),
  );
  return run;
}

/**
 * Web Locks are shared by every page and the service worker of the extension,
 * so the options page and the background never refresh one OAuth token twice.
 */
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  return locks ? (locks.request(name, fn) as Promise<T>) : localLock(name, fn);
}

/**
 * pi-ai CredentialStore over one extension storage item (chrome.storage.local).
 * `modify` holds a per-provider lock for the whole read-refresh-write; the write
 * itself takes a short global lock because all providers share one map.
 */
export function storageCredentialStore(item: MapItem): CredentialStore {
  const write = (mutate: (all: CredentialMap) => void) =>
    withLock('happydesk:cred:write', async () => {
      const all = { ...(await item.getValue()) };
      mutate(all);
      await item.setValue(all);
    });
  return {
    read: async (id) => (await item.getValue())[id],
    list: async (): Promise<CredentialInfo[]> =>
      Object.entries(await item.getValue()).map(([providerId, c]) => ({ providerId, type: c.type })),
    modify: (id, fn) =>
      withLock(`happydesk:cred:${id}`, async () => {
        const current = (await item.getValue())[id];
        const next = await fn(current);
        if (next === undefined) return current;
        await write((all) => (all[id] = next));
        return next;
      }),
    delete: (id) =>
      withLock(`happydesk:cred:${id}`, () =>
        write((all) => {
          delete all[id];
        }),
      ),
  };
}
