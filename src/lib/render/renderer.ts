import type { SpriteAsset, StateAsset, VideoAsset } from '../pack/types';

/**
 * Draws one animation asset into an element sized to the pack's cell size.
 * New asset formats (e.g. Live2D) plug in by adding another Renderer.
 */
export interface Renderer {
  readonly el: HTMLElement;
  /** Start `asset`. `onEnd` fires once when a non-looping asset finishes. */
  show(asset: StateAsset, onEnd?: () => void): void;
  destroy(): void;
}

export interface CellSize {
  w: number;
  h: number;
}

/** Extension-packaged assets are exempt from page CSP; anything else is drawn via canvas. */
function isExtensionUrl(src: string): boolean {
  return /^(chrome|moz)-extension:\/\//.test(src);
}

const bitmaps = new Map<string, Promise<ImageBitmap>>();

/** Turns `hdblob:` references into fetchable URLs (set by the content script). */
let resolveSrc: (src: string) => Promise<string> = async (src) => src;
export function setSrcResolver(fn: (src: string) => Promise<string>): void {
  resolveSrc = fn;
}

/** Fetch from the content script (not subject to page CSP) and decode once per src. */
export function loadBitmap(src: string): Promise<ImageBitmap> {
  let p = bitmaps.get(src);
  if (!p) {
    p = resolveSrc(src)
      .then((url) => fetch(url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => createImageBitmap(b));
    p.catch(() => bitmaps.delete(src));
    bitmaps.set(src, p);
  }
  return p;
}

export class SpriteRenderer implements Renderer {
  readonly el: HTMLDivElement;
  private timer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private canvas: HTMLCanvasElement | null = null;
  private bitmap: ImageBitmap | null = null;
  private token = 0;

  constructor(private size: CellSize) {
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      width: `${size.w}px`,
      height: `${size.h}px`,
      backgroundRepeat: 'no-repeat',
      imageRendering: 'auto',
    });
  }

  show(asset: StateAsset, onEnd?: () => void): void {
    if (asset.kind !== 'sprite') throw new Error('SpriteRenderer only renders sprite assets');
    this.stop();
    const token = ++this.token;
    this.frame = 0;
    if (isExtensionUrl(asset.src)) {
      this.useCss(asset);
      this.start(asset, onEnd);
      return;
    }
    this.useCanvas();
    this.bitmap = null;
    loadBitmap(asset.src).then(
      (bmp) => {
        if (token !== this.token) return;
        this.bitmap = bmp;
        this.start(asset, onEnd);
      },
      (e) => console.warn('[happydesk] sprite failed to load', asset.src.slice(0, 80), e),
    );
  }

  private useCss(asset: SpriteAsset) {
    this.canvas?.remove();
    this.canvas = null;
    this.el.style.backgroundImage = `url("${asset.src}")`;
    this.el.style.backgroundSize = `${asset.cols * this.size.w}px auto`;
  }

  private useCanvas() {
    this.el.style.backgroundImage = 'none';
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.size.w;
      this.canvas.height = this.size.h;
      this.canvas.style.display = 'block';
      this.el.replaceChildren(this.canvas);
    }
  }

  private start(asset: SpriteAsset, onEnd?: () => void) {
    this.draw(asset);
    if (asset.frames <= 1) {
      onEnd?.();
      return;
    }
    const loop = asset.loop ?? true;
    this.timer = setInterval(() => {
      this.frame++;
      if (this.frame >= asset.frames) {
        if (!loop) {
          this.stop();
          onEnd?.();
          return;
        }
        this.frame = 0;
      }
      this.draw(asset);
    }, 1000 / asset.fps);
  }

  /** Exposed for tests. */
  get currentFrame(): number {
    return this.frame;
  }

  private draw(asset: SpriteAsset) {
    const { w, h } = this.size;
    const col = this.frame % asset.cols;
    const row = (asset.row ?? 0) + Math.floor(this.frame / asset.cols);
    if (!this.canvas) {
      this.el.style.backgroundPosition = `${-col * w}px ${-row * h}px`;
      return;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.bitmap) return;
    // Source cells keep the pack's aspect ratio, whatever the sheet's resolution.
    const sw = this.bitmap.width / asset.cols;
    const sh = (sw * h) / w;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.bitmap, col * sw, row * sh, sw, sh, 0, 0, w, h);
  }

  private stop() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  destroy(): void {
    this.token++;
    this.stop();
    this.el.remove();
  }
}

export class VideoRenderer implements Renderer {
  readonly el: HTMLVideoElement;
  private endHandler: (() => void) | undefined;

  constructor(size: CellSize) {
    this.el = document.createElement('video');
    this.el.muted = true;
    this.el.playsInline = true;
    this.el.autoplay = true;
    this.el.width = size.w;
    this.el.height = size.h;
    this.el.style.objectFit = 'contain';
    this.el.style.display = 'block';
    // Keep the mascot's own video out of media detection.
    this.el.dataset.happydesk = 'true';
  }

  show(asset: StateAsset, onEnd?: () => void): void {
    if (asset.kind !== 'video') throw new Error('VideoRenderer only renders video assets');
    const video: VideoAsset = asset;
    if (this.endHandler) this.el.removeEventListener('ended', this.endHandler);
    this.endHandler = undefined;
    this.el.loop = video.loop ?? true;
    if (!this.el.loop && onEnd) {
      this.endHandler = () => onEnd();
      this.el.addEventListener('ended', this.endHandler, { once: true });
    }
    if (this.el.src !== video.src) this.el.src = video.src;
    else this.el.currentTime = 0;
    void this.el.play().catch(() => {});
  }

  destroy(): void {
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
    this.el.remove();
  }
}

/** Owns the current renderer and swaps it when the asset kind changes. */
export class Stage {
  private renderer: Renderer | undefined;

  constructor(
    private container: HTMLElement,
    private size: CellSize,
  ) {}

  show(asset: StateAsset, onEnd?: () => void): void {
    const wanted = asset.kind === 'sprite' ? SpriteRenderer : VideoRenderer;
    if (!(this.renderer instanceof wanted)) {
      this.renderer?.destroy();
      this.renderer = new wanted(this.size);
      this.container.replaceChildren(this.renderer.el);
    }
    this.renderer.show(asset, onEnd);
  }

  destroy(): void {
    this.renderer?.destroy();
    this.renderer = undefined;
  }
}
