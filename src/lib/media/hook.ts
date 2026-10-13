import {
  ATTR_ACTIONS,
  ATTR_DETACHED,
  ATTR_META,
  CMD_EVENT,
  STATE_EVENT,
  pickArtwork,
  type BridgeCommand,
  type BridgeMeta,
  type DetachedState,
} from './bridge';

const INSTALLED = Symbol.for('happydesk.hook');

/**
 * Runs in the page's main world. Mirrors Media Session handlers/metadata and
 * detached media elements onto the DOM so the isolated content script can see
 * and drive them.
 */
export function installHook(win: Window & typeof globalThis): void {
  const w = win as unknown as Record<symbol, boolean>;
  if (w[INSTALLED]) return;
  w[INSTALLED] = true;

  const doc = win.document;
  const root = () => doc.documentElement;
  const handlers = new Map<string, (details: Record<string, unknown>) => void>();
  let notifyQueued = false;

  const notify = () => {
    if (notifyQueued) return;
    notifyQueued = true;
    queueMicrotask(() => {
      notifyQueued = false;
      doc.dispatchEvent(new CustomEvent(STATE_EVENT));
    });
  };

  const setAttr = (name: string, value: string | null) => {
    const el = root();
    if (!el) return;
    if (value === null) el.removeAttribute(name);
    else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const mirrorActions = () => {
    setAttr(ATTR_ACTIONS, [...handlers.keys()].join(','));
    notify();
  };

  const mirrorMeta = () => {
    const m = win.navigator.mediaSession?.metadata;
    if (!m) {
      setAttr(ATTR_META, null);
      return;
    }
    const meta: BridgeMeta = {
      title: m.title ?? '',
      artist: m.artist ?? '',
      album: m.album ?? '',
      artwork: pickArtwork(m.artwork as ReadonlyArray<{ src: string; sizes?: string }>),
    };
    setAttr(ATTR_META, JSON.stringify(meta));
  };

  // --- Media Session ---------------------------------------------------------
  const MS = (win as unknown as { MediaSession?: { prototype: MediaSession } }).MediaSession;
  if (MS) {
    const proto = MS.prototype;
    const origSet = proto.setActionHandler;
    proto.setActionHandler = function (action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
      if (handler) handlers.set(action, handler as unknown as (d: Record<string, unknown>) => void);
      else handlers.delete(action);
      mirrorActions();
      return origSet.call(this, action, handler);
    };
    const desc = Object.getOwnPropertyDescriptor(proto, 'metadata');
    if (desc?.set && desc.get) {
      Object.defineProperty(proto, 'metadata', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set(v: MediaMetadata | null) {
          desc.set!.call(this, v);
          mirrorMeta();
          notify();
        },
      });
    }
  }

  // --- Detached media elements ----------------------------------------------
  let detached: HTMLMediaElement | null = null;
  const watched = new WeakSet<HTMLMediaElement>();

  const mirrorDetached = () => {
    if (!detached || detached.isConnected) {
      setAttr(ATTR_DETACHED, null);
      return;
    }
    const s: DetachedState = {
      playing: !detached.paused && !detached.ended,
      currentTime: detached.currentTime || 0,
      duration: Number.isFinite(detached.duration) ? detached.duration : 0,
      volume: detached.volume,
      muted: detached.muted,
      ...(detached.duration === Infinity ? { live: true } : {}),
    };
    setAttr(ATTR_DETACHED, JSON.stringify(s));
  };

  let lastTimeMirror = 0;
  const onMediaEvent = (e: Event) => {
    if (e.type === 'timeupdate') {
      const now = Date.now();
      if (now - lastTimeMirror < 1000) return;
      lastTimeMirror = now;
    }
    mirrorDetached();
    mirrorMeta();
    notify();
  };

  const MediaEl = win.HTMLMediaElement;
  if (MediaEl) {
    const origPlay = MediaEl.prototype.play;
    MediaEl.prototype.play = function (this: HTMLMediaElement) {
      if (!this.isConnected && (this as HTMLElement).dataset?.happydesk !== 'true') {
        detached = this;
        if (!watched.has(this)) {
          watched.add(this);
          for (const t of ['play', 'pause', 'ended', 'timeupdate', 'volumechange', 'durationchange', 'emptied'])
            this.addEventListener(t, onMediaEvent);
        }
      }
      return origPlay.call(this);
    };
  }

  // In-DOM media: keep metadata fresh as playback changes.
  for (const t of ['play', 'pause', 'loadedmetadata'])
    doc.addEventListener(t, () => {
      mirrorMeta();
      notify();
    }, true);

  // --- Commands from the isolated world --------------------------------------
  doc.addEventListener(CMD_EVENT, (e) => {
    let cmd: BridgeCommand;
    try {
      cmd = JSON.parse(String((e as CustomEvent).detail)) as BridgeCommand;
    } catch {
      return;
    }
    if (cmd.target === 'session') {
      const h = handlers.get(cmd.action);
      if (!h) return;
      try {
        h(cmd.action === 'seekto' ? { action: cmd.action, seekTime: cmd.seekTime } : { action: cmd.action });
      } catch (err) {
        console.warn('[happydesk] media session handler failed', err);
      }
      return;
    }
    const el = detached;
    if (!el) return;
    switch (cmd.op) {
      case 'play':
        void el.play().catch(() => {});
        break;
      case 'pause':
        el.pause();
        break;
      case 'seek':
        if (typeof cmd.value === 'number') el.currentTime = cmd.value;
        break;
      case 'volume':
        if (typeof cmd.value === 'number') el.volume = Math.min(1, Math.max(0, cmd.value));
        break;
      case 'mute':
        el.muted = !!cmd.value;
        break;
    }
  });

  mirrorMeta();
}
