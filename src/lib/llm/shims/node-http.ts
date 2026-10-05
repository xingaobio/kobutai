/**
 * Browser stand-in for `node:http`, aliased in wxt.config.ts.
 *
 * pi-ai's OAuth flows start a loopback server (http://localhost:<port>/callback)
 * and wait for the provider to redirect the browser there. An extension can't
 * listen on a port, so the "server" here only records its request handler; the
 * sign-in dialog watches the sign-in tab and replays the redirect URL into it
 * with `deliverLoopback`. Flows that can't be completed this way fall back to
 * pi-ai's own "paste the redirect URL" prompt.
 */

type Handler = (req: { method: string; url: string }, res: FakeResponse) => void | Promise<void>;
type Listener = (...args: unknown[]) => void;

interface FakeResponse {
  writeHead(status: number, headers?: Record<string, string>): FakeResponse;
  end(body?: string): void;
}

const servers = new Map<number, Handler>();

function freePort(): number {
  let p: number;
  do p = 49152 + Math.floor(Math.random() * 16000);
  while (servers.has(p));
  return p;
}

export function createServer(handler: Handler) {
  let port: number | undefined;
  const listeners = new Map<string, Set<Listener>>();
  const server = {
    listen(p: number, ...rest: unknown[]) {
      // Port 0 means "any free port"; nothing really binds, so any port no flow is using will do.
      port = p || freePort();
      servers.set(port, handler);
      const cb = rest.find((r): r is () => void => typeof r === 'function');
      queueMicrotask(() => cb?.());
      return server;
    },
    address: () => (port === undefined ? null : { port, address: '127.0.0.1', family: 'IPv4' }),
    on(ev: string, fn: Listener) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(fn);
      return server;
    },
    once(ev: string, fn: Listener) {
      return server.on(ev, fn);
    },
    off(ev: string, fn: Listener) {
      listeners.get(ev)?.delete(fn);
      return server;
    },
    removeListener(ev: string, fn: Listener) {
      return server.off(ev, fn);
    },
    close(cb?: () => void) {
      if (port !== undefined && servers.get(port) === handler) servers.delete(port);
      cb?.();
      return server;
    },
    closeAllConnections() {},
    unref: () => server,
  };
  return server;
}

/** Whether a sign-in flow is currently waiting for a redirect to this loopback URL. */
export function isLoopbackPending(url: URL): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) && servers.has(Number(url.port || 80));
}

/**
 * Hand a captured loopback redirect to the flow waiting on its port.
 * Resolves with the status the flow answered (200 = accepted), or null when nothing was waiting.
 */
export async function deliverLoopback(url: URL): Promise<number | null> {
  if (!isLoopbackPending(url)) return null;
  const handler = servers.get(Number(url.port || 80))!;
  return new Promise<number>((resolve) => {
    let status = 200;
    const res: FakeResponse = {
      writeHead(s) {
        status = s;
        return res;
      },
      end: () => resolve(status),
    };
    void Promise.resolve(handler({ method: 'GET', url: url.pathname + url.search }, res)).catch(() => resolve(500));
  });
}

export default { createServer };
