/**
 * The few `browser.*` calls the shared code makes outside the extension. Anything else throws,
 * so code that sneaks in an extension-only API fails in development instead of misbehaving.
 */

/**
 * Packaged files (`/packs/index.json`, `/emoji/x.webp`, `/model/...`) are served from the app's
 * origin root. The result is absolute because pack loading builds URLs with `new URL(x, root)`.
 */
export function assetUrl(path: string, origin: string = globalThis.location?.origin ?? 'http://localhost'): string {
  const base = origin && origin !== 'null' ? origin : 'http://localhost';
  return new URL(path.startsWith('/') ? path : `/${path}`, base).href;
}

function unavailable(path: string): never {
  throw new Error(`[kobutai-desktop] ${path} is not available in the desktop app (extension-only API)`);
}

/** An object that allows `allowed` and throws on any other property. */
function strict<T extends object>(name: string, allowed: T): T {
  return new Proxy(allowed, {
    get(target, prop, receiver) {
      // Symbols and `then` are probed by tooling (console, Promise resolution); they are not API use.
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON' || prop in target) return Reflect.get(target, prop, receiver);
      return unavailable(`${name}.${prop}`);
    },
  });
}

export const desktopBrowser = strict('browser', {
  runtime: strict('browser.runtime', {
    getURL: (path: string) => assetUrl(path),
  }),
});

export type DesktopBrowser = typeof desktopBrowser;

declare global {
  // eslint-disable-next-line no-var
  var browser: DesktopBrowser;
}

/** Make `browser` a global, as WXT's auto-imports do for the extension build. */
export function installBrowserShim(target: { browser?: unknown } = globalThis): void {
  target.browser ??= desktopBrowser;
}
