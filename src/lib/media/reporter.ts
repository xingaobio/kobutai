import { STATE_EVENT } from './bridge';
import type { MediaController, MediaSnapshot } from './types';
import type { ToBackground, ToContent } from '../messages';

export interface ClientPort {
  postMessage(msg: ToBackground): void;
  onMessage: { addListener(fn: (msg: ToContent) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

const EVENTS = ['play', 'playing', 'pause', 'ended', 'seeked', 'volumechange', 'loadedmetadata', 'durationchange', 'emptied'];
const POLL_MS = 2000;

/** Seconds of progress that count as a change worth reporting (timeupdate fires ~4×/s). */
const TIME_EPSILON = 0.9;

function changed(a: MediaSnapshot | null, b: MediaSnapshot | null): boolean {
  if (!a || !b) return a !== b;
  for (const k of Object.keys(b) as (keyof MediaSnapshot)[]) {
    if (k === 'currentTime') continue;
    if (a[k] !== b[k]) return true;
  }
  return Math.abs(a.currentTime - b.currentTime) >= TIME_EPSILON;
}

/**
 * Keeps the background informed about this frame's media and executes the
 * commands it routes back. Reconnects when the service worker restarts.
 */
export class MediaReporter {
  private port: ClientPort | null = null;
  private last: MediaSnapshot | null = null;
  private sentOnce = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private retry = 0;
  private disposed = false;
  private scheduled = false;
  private readonly onEvent = () => this.schedule();

  constructor(
    private readonly controller: MediaController,
    private readonly connect: () => ClientPort,
    private readonly doc: Document = document,
    private readonly onMessage: (msg: ToContent) => void = () => {},
  ) {}

  start(): void {
    for (const t of [...EVENTS, 'timeupdate']) this.doc.addEventListener(t, this.onEvent, true);
    this.doc.addEventListener(STATE_EVENT, this.onEvent);
    this.timer = setInterval(() => this.report(), POLL_MS);
    this.open();
    this.report();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [...EVENTS, 'timeupdate']) this.doc.removeEventListener(t, this.onEvent, true);
    this.doc.removeEventListener(STATE_EVENT, this.onEvent);
    clearInterval(this.timer);
  }

  send(msg: ToBackground): void {
    try {
      this.port?.postMessage(msg);
    } catch {
      this.port = null;
    }
  }

  private open(): void {
    if (this.disposed) return;
    let port: ClientPort;
    try {
      port = this.connect();
    } catch {
      // Extension context invalidated (extension reloaded): stop quietly.
      this.dispose();
      return;
    }
    this.port = port;
    port.onMessage.addListener((msg) => {
      this.retry = 0;
      if (msg.t === 'command') {
        this.controller.run(msg.cmd);
        setTimeout(() => this.report(), 150);
      }
      this.onMessage(msg);
    });
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      const delay = Math.min(10_000, 250 * 2 ** this.retry++);
      setTimeout(() => {
        this.open();
        this.report(true);
      }, delay);
    });
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.report();
    });
  }

  report(force = false): void {
    if (!this.port) return;
    const snap = this.controller.snapshot();
    if (!force && this.sentOnce && !changed(this.last, snap)) return;
    // Frames without media stay silent until they have something to report.
    if (!this.sentOnce && !snap) return;
    this.last = snap;
    this.sentOnce = true;
    this.send({ t: 'snapshot', snap });
  }
}
