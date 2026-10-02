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

export class SpriteRenderer implements Renderer {
  readonly el: HTMLDivElement;
  private timer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;

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
    const { w, h } = this.size;
    this.el.style.backgroundImage = `url("${asset.src}")`;
    this.el.style.backgroundSize = `${asset.cols * w}px auto`;
    this.frame = 0;
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
    this.el.style.backgroundPosition = `${-col * w}px ${-row * h}px`;
  }

  private stop() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  destroy(): void {
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
