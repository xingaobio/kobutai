/**
 * The overlay window covers the whole work area and is click-through by default. The Rust side
 * only lets the mouse reach the page inside the rectangles reported here (CSS px, window
 * coordinates; DESKTOP.md §4.3), so they have to follow the character, the control bar and the
 * resize handle around.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Contract: at most one report every 50 ms. */
export const REPORT_INTERVAL_MS = 50;
/**
 * The control bar is 6 px away from the character, and a click-through gap between the two would
 * make the bar vanish (the hover ends) while the mouse is on its way there. Padding the bar's
 * rectangle closes that gap.
 */
export const BAR_PADDING = 8;

const sameRects = (a: readonly Rect[], b: readonly Rect[]) =>
  a.length === b.length && a.every((r, i) => r.x === b[i]!.x && r.y === b[i]!.y && r.w === b[i]!.w && r.h === b[i]!.h);

export interface HitReporterOptions {
  collect(): Rect[];
  send(rects: Rect[]): void;
  intervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Sends the rectangles `collect()` returns whenever they change, at most once per interval.
 * Call `update()` after anything that may have moved something; unchanged results send nothing.
 * A change that comes too soon is sent when the interval is over, with the then-current rectangles.
 */
export function createHitReporter(opts: HitReporterOptions) {
  const interval = opts.intervalMs ?? REPORT_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let last: Rect[] | null = null;
  let lastAt = -Infinity;
  let timer: unknown = null;

  function flush(): void {
    timer = null;
    const rects = opts.collect();
    if (last && sameRects(last, rects)) return;
    const wait = lastAt + interval - now();
    if (wait > 0) {
      timer = setTimer(flush, wait);
      return;
    }
    last = rects;
    lastAt = now();
    opts.send(rects);
  }

  return {
    update(): void {
      if (timer === null) flush();
    },
    dispose(): void {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

// --- Reading the rectangles out of the mounted overlay -------------------------------------------

export interface CollectOptions {
  /**
   * Make the emoji bubble interactive too. Off: the bubble has `pointer-events: none`, so it
   * could never react, and a click on it would be swallowed by the transparent window.
   */
  includeBubble?: boolean;
  barPadding?: number;
}

const SELECTORS = {
  character: '[data-testid="happydesk-overlay"]',
  resize: '.resize',
  bar: '[data-testid="happydesk-controls"]',
  bubble: '.bubble',
} as const;

function toRect(r: DOMRect, pad: number, view: { w: number; h: number }): Rect | null {
  // Padding must not turn an element with no size into a phantom hit area.
  if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return null;
  const x0 = Math.max(0, Math.floor(r.left) - pad);
  const y0 = Math.max(0, Math.floor(r.top) - pad);
  const x1 = Math.min(view.w, Math.ceil(r.right) + pad);
  const y1 = Math.min(view.h, Math.ceil(r.bottom) + pad);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Character (and its resize handle while hovering), control bar and optionally bubble; none when no character is shown. */
export function collectHitRects(doc: Document = document, opts: CollectOptions = {}): Rect[] {
  const root = doc.querySelector(SELECTORS.character);
  if (!root) return [];
  const view = { w: doc.documentElement.clientWidth || innerWidth, h: doc.documentElement.clientHeight || innerHeight };
  const out: Rect[] = [];
  const add = (el: Element | null, pad = 0) => {
    const r = el && toRect(el.getBoundingClientRect(), pad, view);
    if (r) out.push(r);
  };
  add(root);
  add(root.querySelector(SELECTORS.resize));
  if (opts.includeBubble) add(root.querySelector(SELECTORS.bubble));
  add(doc.querySelector(SELECTORS.bar), opts.barPadding ?? BAR_PADDING);
  return out;
}

/**
 * Re-measure whenever the page changes (elements added or restyled, window resized) and on a
 * slow timer as a safety net for anything those miss. Returns a function that stops watching.
 */
export function watchHitRects(update: () => void, doc: Document = document): () => void {
  const mo = new MutationObserver(update);
  mo.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  const view = doc.defaultView ?? window;
  view.addEventListener('resize', update);
  const poll = setInterval(update, 500);
  update();
  return () => {
    mo.disconnect();
    view.removeEventListener('resize', update);
    clearInterval(poll);
  };
}
