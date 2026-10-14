import { Hub, type PortLike } from '@/lib/hub';
import type { MediaCommand, MediaSnapshot } from '@/lib/media/types';
import type { ToBackground, ToContent } from '@/lib/messages';
import { entryKey } from '@/lib/registry';

// --- The contract with the Rust side (docs/development/DESKTOP.md §4) --------------------------

export interface DesktopSession {
  /** SourceAppUserModelId, e.g. "Spotify.exe". */
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
  playing: boolean;
  /** Seconds, extrapolated to the moment of sending while playing. */
  position: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  canPlay: boolean;
  canPause: boolean;
  canNext: boolean;
  canPrev: boolean;
  canSeek: boolean;
}

export interface SessionsPayload {
  sessions: DesktopSession[];
  /** The system's current ("main") session, or null. */
  currentId: string | null;
}

export type DesktopCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; time: number };

export const SESSIONS_EVENT = 'media://sessions';
export const COMMAND_CMD = 'media_command';
export const SESSIONS_CMD = 'media_sessions';

// --- Session → snapshot (§5) -------------------------------------------------------------------

/** Application id fragment (lower case) → the site whose classifier rules should apply. */
const PSEUDO_SITES: readonly (readonly [readonly string[], string])[] = [
  [['spotify'], 'open.spotify.com'],
  [['applemusic', 'itunes'], 'music.apple.com'],
  [['cloudmusic'], 'music.163.com'],
  [['qqmusic'], 'y.qq.com'],
  [['kugou'], 'www.kugou.com'],
];

/**
 * The pseudo-site for an application id. Known music apps map to their web site, so the
 * classifier's site rules keep working; any other app is its lower-case name without path and ".exe".
 */
export function siteFor(appId: string): string {
  const id = appId.toLowerCase();
  for (const [needles, site] of PSEUDO_SITES) if (needles.some((n) => id.includes(n))) return site;
  const name = id.split(/[\\/]/).pop()!.replace(/\.exe$/, '');
  return name || 'unknown';
}

const seconds = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function snapshotOf(s: DesktopSession): MediaSnapshot {
  return {
    playing: s.playing,
    currentTime: seconds(s.position),
    duration: seconds(s.duration),
    volume: 1,
    muted: false,
    canVolume: false,
    title: s.title,
    artist: s.artist,
    canNext: s.canNext,
    canPrev: s.canPrev,
    canSeek: s.canSeek,
    adapter: 'smtc',
    site: siteFor(s.id),
  };
}

/** Hub command → system command. Volume and mute are out of scope for D1: null = not sent. */
export function commandOf(cmd: MediaCommand): DesktopCommand | null {
  switch (cmd.type) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'next':
    case 'prev':
      return { type: cmd.type };
    case 'seek':
      return { type: 'seek', time: seconds(cmd.time) };
    default:
      return null;
  }
}

/** FNV-1a, folded to a positive 31-bit integer: the same app id always gets the same tab id. */
export function stableHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

// --- Ports ------------------------------------------------------------------------------------

/** One system session as seen by the hub: a content-script port that never talks to a page. */
class SessionPort implements PortLike {
  readonly sender: PortLike['sender'];
  private messageListeners: ((msg: ToBackground) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  readonly onMessage = { addListener: (fn: (msg: ToBackground) => void) => void this.messageListeners.push(fn) };
  readonly onDisconnect = { addListener: (fn: () => void) => void this.disconnectListeners.push(fn) };

  constructor(
    readonly sessionId: string,
    readonly tabId: number,
    private readonly onCommand: (cmd: MediaCommand) => void,
  ) {
    this.sender = { tab: { id: tabId }, frameId: 0 };
  }

  /** The hub talks to this "frame": it only cares about commands (state broadcasts are for the overlay). */
  postMessage(msg: ToContent): void {
    if (msg.t === 'command') this.onCommand(msg.cmd);
  }

  get key(): string {
    return entryKey(this.tabId, 0);
  }

  emit(msg: ToBackground): void {
    for (const fn of this.messageListeners) fn(msg);
  }

  disconnect(): void {
    const fns = this.disconnectListeners;
    this.disconnectListeners = [];
    this.messageListeners = [];
    for (const fn of fns) fn();
  }
}

// --- The adapter ------------------------------------------------------------------------------

export interface SessionsIo {
  /** Subscribe to an event; resolves to the unsubscribe function. The callback gets the event's payload. */
  listen(event: string, cb: (payload: SessionsPayload) => void): Promise<() => void>;
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>;
}

export interface SessionsHandle {
  /** Stop listening and disconnect every session. */
  stop(): void;
  /** Resolves when the subscription and the first pull are done (for tests and startup ordering). */
  ready: Promise<void>;
}

/**
 * Feeds the system's media sessions into the hub, one port per session, so the registry,
 * presence, gacha and overlay code treat them like browser tabs. Subscribes to
 * "media://sessions" and pulls `media_sessions` once at start.
 */
export function connectSessions(hub: Hub, io: SessionsIo): SessionsHandle {
  const ports = new Map<string, SessionPort>();
  const tabIds = new Set<number>();
  let wasPlaying = new Set<string>();
  let stopped = false;
  let gotEvent = false;

  const tabIdFor = (id: string): number => {
    let h = stableHash(id);
    // Two live sessions sharing a hash is vanishingly rare; if it happens, the later one moves on.
    while (tabIds.has(h)) h = (h + 1) & 0x7fffffff;
    tabIds.add(h);
    return h;
  };

  const send = (id: string, cmd: MediaCommand) => {
    const mapped = commandOf(cmd);
    if (!mapped) return;
    io.invoke(COMMAND_CMD, { id, cmd: mapped }).catch((e: unknown) => console.warn(`[kobutai] media_command ${cmd.type} failed:`, e));
  };

  function apply(payload: SessionsPayload): void {
    if (stopped) return;
    const sessions = payload.sessions ?? [];
    const live = new Set(sessions.map((s) => s.id));

    for (const [id, port] of ports) {
      if (live.has(id)) continue;
      ports.delete(id);
      tabIds.delete(port.tabId);
      port.disconnect();
    }

    const started: string[] = [];
    for (const s of sessions) {
      let port = ports.get(s.id);
      if (!port) {
        port = new SessionPort(s.id, tabIdFor(s.id), (cmd) => send(s.id, cmd));
        ports.set(s.id, port);
        hub.connect(port);
      }
      if (s.playing && !wasPlaying.has(s.id)) started.push(s.id);
      port.emit({ t: 'snapshot', snap: snapshotOf(s) });
    }
    wasPlaying = new Set(sessions.filter((s) => s.playing).map((s) => s.id));

    // The registry makes the most recently started session primary. When several start at once
    // (the app was launched while they were already playing) that is a coin toss, so let the
    // system's own idea of the current session decide; any later start or pick overrides it.
    const current = payload.currentId ? ports.get(payload.currentId) : undefined;
    if (current && started.length > 1 && started.includes(current.sessionId)) current.emit({ t: 'select', key: current.key });
  }

  const onPayload = (payload: SessionsPayload) => {
    gotEvent = true;
    apply(payload);
  };

  let unlisten: (() => void) | undefined;
  const ready = (async () => {
    try {
      const un = await io.listen(SESSIONS_EVENT, onPayload);
      if (stopped) un();
      else unlisten = un;
    } catch (e) {
      console.error(`[kobutai] cannot listen to ${SESSIONS_EVENT}:`, e);
      return;
    }
    try {
      const initial = (await io.invoke(SESSIONS_CMD)) as SessionsPayload | null;
      // An event that arrived while we were asking is newer than the answer.
      if (initial && !gotEvent) apply(initial);
    } catch (e) {
      console.warn(`[kobutai] ${SESSIONS_CMD} failed:`, e);
    }
  })();

  return {
    ready,
    stop() {
      stopped = true;
      unlisten?.();
      for (const port of ports.values()) port.disconnect();
      ports.clear();
      tabIds.clear();
    },
  };
}
