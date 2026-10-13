import type { DrawView } from './gacha/engine';
import type { ToBackground, ToContent } from './messages';
import { MediaRegistry, entryKey } from './registry';

/** The subset of `Browser.runtime.Port` the hub needs (keeps it unit-testable). */
export interface PortLike {
  sender?: { tab?: { id?: number }; frameId?: number };
  postMessage(msg: ToContent): void;
  onMessage: { addListener(fn: (msg: ToBackground) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

/**
 * Background message hub: every content-script frame connects a port, reports
 * its media snapshot and receives commands; top frames also receive the
 * registry state to render the overlay.
 */
export class Hub {
  readonly registry = new MediaRegistry();
  private ports = new Map<string, PortLike>();
  private viewers = new Set<PortLike>();
  private draw: DrawView | null = null;
  /** Called after any registry change (e.g. to feed the gacha engine). */
  onUpdate: () => void = () => {};
  /** Registry meta changed (persist it so a restarted worker keeps the order). */
  onMeta: () => void = () => {};
  /** Gacha requests from overlays. */
  onGacha: (msg: Extract<ToBackground, { t: 'reroll' | 'lock' }>) => void = () => {};

  constructor(private now: () => number = Date.now) {}

  setDraw(draw: DrawView | null): void {
    if (JSON.stringify(draw) === JSON.stringify(this.draw)) return;
    this.draw = draw;
    this.broadcast();
  }

  connect(port: PortLike): void {
    const tabId = port.sender?.tab?.id;
    const frameId = port.sender?.frameId ?? 0;
    if (tabId === undefined) return;
    const key = entryKey(tabId, frameId);
    // A reconnect (e.g. after the service worker restarted) replaces the old port.
    this.ports.set(key, port);

    port.onMessage.addListener((msg) => this.handle(tabId, frameId, msg));
    port.onDisconnect.addListener(() => {
      if (this.ports.get(key) !== port) return;
      this.ports.delete(key);
      this.registry.remove(tabId, frameId);
      this.broadcast();
      this.onUpdate();
      this.onMeta();
    });
    // Give a fresh overlay the current state immediately.
    if (frameId === 0) this.post(port, { t: 'state', state: this.registry.state(), draw: this.draw });
  }

  /** A page that only watches and controls (the popup): it gets state, and may send anything but snapshots. */
  connectViewer(port: PortLike): void {
    this.viewers.add(port);
    port.onMessage.addListener((msg) => {
      if (msg.t !== 'snapshot') this.handle(-1, -1, msg);
    });
    port.onDisconnect.addListener(() => this.viewers.delete(port));
    this.post(port, { t: 'state', state: this.registry.state(), draw: this.draw });
  }

  private handle(tabId: number, frameId: number, msg: ToBackground): void {
    switch (msg.t) {
      case 'snapshot':
        this.registry.update(tabId, frameId, msg.snap, this.now());
        this.broadcast();
        this.onUpdate();
        this.onMeta();
        return;
      case 'command': {
        const target = msg.key ? this.registry.get(msg.key) : this.registry.primary();
        const port = target && this.ports.get(target.key);
        if (port) this.post(port, { t: 'command', cmd: msg.cmd });
        return;
      }
      case 'select':
        if (this.registry.select(msg.key)) {
          this.broadcast();
          this.onUpdate();
          this.onMeta();
        }
        return;
      case 'reroll':
      case 'lock':
        this.onGacha(msg);
        return;
    }
  }

  private broadcast(): void {
    const state = this.registry.state();
    for (const [key, port] of this.ports) if (key.endsWith(':0')) this.post(port, { t: 'state', state, draw: this.draw });
    for (const port of this.viewers) this.post(port, { t: 'state', state, draw: this.draw });
  }

  private post(port: PortLike, msg: ToContent): void {
    try {
      port.postMessage(msg);
    } catch {
      // Port died between disconnect events; the disconnect handler cleans up.
    }
  }
}
