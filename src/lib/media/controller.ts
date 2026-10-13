import type { SiteAdapter } from './adapters/types';
import { readActions, readDetached, readMeta, safeImageUrl, sendBridgeCommand, type DetachedState } from './bridge';
import type { MediaCommand, MediaController, MediaSnapshot } from './types';

const OWN = '[data-happydesk]';

function isOwn(el: Element): boolean {
  return el.matches(OWN) || !!el.closest(OWN);
}

/** Muted, small autoplaying videos are hover previews or decoration, not what the user is watching. */
function isPreview(el: HTMLMediaElement): boolean {
  if (!el.muted || !(el instanceof HTMLVideoElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width * r.height > 0 && r.width * r.height < 320 * 180;
}

function elementState(el: HTMLMediaElement): DetachedState {
  return {
    playing: !el.paused && !el.ended,
    currentTime: el.currentTime || 0,
    duration: Number.isFinite(el.duration) ? el.duration : 0,
    volume: el.volume,
    muted: el.muted,
    ...(el.duration === Infinity ? { live: true } : {}),
  };
}

/**
 * Generic controller for one frame: HTML media elements, Media Session handlers
 * (via the main-world bridge) and detached media, refined by an optional site adapter.
 */
export class PageMediaController implements MediaController {
  readonly id: string;
  private lastPlayed: HTMLMediaElement | null = null;
  private readonly onPlay = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLMediaElement && !isOwn(t)) this.lastPlayed = t;
  };

  constructor(
    private readonly doc: Document,
    private readonly loc: Location,
    private readonly adapter: SiteAdapter | null,
  ) {
    this.id = adapter?.id ?? 'generic';
    doc.addEventListener('play', this.onPlay, true);
  }

  dispose(): void {
    this.doc.removeEventListener('play', this.onPlay, true);
  }

  /** The element this frame should report on, or null. */
  media(): HTMLMediaElement | null {
    const fromAdapter = this.adapter?.findMedia?.(this.doc);
    if (fromAdapter) return fromAdapter;
    if (this.adapter?.ignoreDomMedia) return null;
    if (this.lastPlayed?.isConnected && !isPreview(this.lastPlayed)) return this.lastPlayed;
    const all = [...this.doc.querySelectorAll<HTMLMediaElement>('video, audio')].filter(
      (m) =>
        !isOwn(m) &&
        !isPreview(m) &&
        (m.currentSrc || m.src || m.querySelector('source')) &&
        // Untouched media (never started) isn't something the user is listening to.
        (!m.paused || m.currentTime > 0),
    );
    const playing = all.filter((m) => !m.paused && !m.ended);
    return playing.find((m) => !m.muted) ?? playing[0] ?? all[0] ?? null;
  }

  private state(): { el: HTMLMediaElement | null; s: DetachedState; via: 'element' | 'detached' | 'dom' } | null {
    const el = this.media();
    if (el) return { el, s: elementState(el), via: 'element' };
    const d = readDetached(this.doc);
    if (d) return { el: null, s: d, via: 'detached' };
    const dom = this.adapter?.domState?.(this.doc);
    if (dom) return { el: null, s: dom, via: 'dom' };
    return null;
  }

  snapshot(): MediaSnapshot | null {
    const st = this.state();
    if (!st) return null;
    const actions = readActions(this.doc);
    const meta = readMeta(this.doc);
    const info = this.adapter?.info?.(this.doc, this.loc) ?? {};
    const { s } = st;
    return {
      playing: s.playing,
      currentTime: s.currentTime,
      duration: s.duration,
      volume: s.volume,
      muted: s.muted,
      title: info.title || meta?.title || this.doc.title || this.loc.hostname,
      artist: info.artist || meta?.artist || '',
      artwork: safeImageUrl(info.artwork || meta?.artwork),
      canNext: actions.has('nexttrack') || !!this.adapter?.nextButton?.(this.doc),
      canPrev: actions.has('previoustrack') || !!this.adapter?.prevButton?.(this.doc),
      canSeek: s.duration > 0 && (st.via !== 'dom' || actions.has('seekto')),
      adapter: this.id,
      site: this.loc.hostname,
      ...(s.live ? { live: true } : {}),
    };
  }

  run(cmd: MediaCommand): void {
    const st = this.state();
    const actions = readActions(this.doc);
    const session = (action: string, seekTime?: number) => {
      if (!actions.has(action)) return false;
      sendBridgeCommand(this.doc, { target: 'session', action, seekTime });
      return true;
    };

    switch (cmd.type) {
      case 'toggle':
        return this.run({ type: st?.s.playing ? 'pause' : 'play' });
      case 'play':
      case 'pause': {
        if (st?.el) {
          if (cmd.type === 'play') void st.el.play().catch(() => {});
          else st.el.pause();
          return;
        }
        if (session(cmd.type)) return;
        if (st?.via === 'detached') return sendBridgeCommand(this.doc, { target: 'detached', op: cmd.type });
        const btn = this.adapter?.playPauseButton?.(this.doc);
        if (btn && st && st.s.playing !== (cmd.type === 'play')) btn.click();
        return;
      }
      case 'next':
      case 'prev': {
        const action = cmd.type === 'next' ? 'nexttrack' : 'previoustrack';
        const btn = cmd.type === 'next' ? this.adapter?.nextButton?.(this.doc) : this.adapter?.prevButton?.(this.doc);
        // Site buttons are the most faithful; Media Session handlers are the generic fallback.
        if (btn) btn.click();
        else session(action);
        return;
      }
      case 'seek': {
        const t = Math.max(0, cmd.time);
        if (st?.el) st.el.currentTime = t;
        else if (!session('seekto', t) && st?.via === 'detached')
          sendBridgeCommand(this.doc, { target: 'detached', op: 'seek', value: t });
        return;
      }
      case 'volume': {
        const v = Math.min(1, Math.max(0, cmd.volume));
        if (st?.el) {
          st.el.volume = v;
          if (v > 0 && st.el.muted) st.el.muted = false;
        } else if (st?.via === 'detached') sendBridgeCommand(this.doc, { target: 'detached', op: 'volume', value: v });
        return;
      }
      case 'mute':
        if (st?.el) st.el.muted = cmd.muted;
        else if (st?.via === 'detached')
          sendBridgeCommand(this.doc, { target: 'detached', op: 'mute', value: cmd.muted ? 1 : 0 });
        return;
    }
  }
}
