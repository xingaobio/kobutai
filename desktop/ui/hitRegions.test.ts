import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BAR_PADDING, REPORT_INTERVAL_MS, collectHitRects, createHitReporter, type Rect } from './hitRegions';

describe('createHitReporter', () => {
  let rects: Rect[];
  let sent: Rect[][];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    rects = [];
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  const make = () => createHitReporter({ collect: () => rects, send: (r) => sent.push(r) });
  const box = (x: number): Rect => ({ x, y: 0, w: 10, h: 10 });

  test('the first report goes out at once, even when empty', () => {
    make().update();
    expect(sent).toEqual([[]]);
  });

  test('unchanged rectangles send nothing', () => {
    const r = make();
    rects = [box(1)];
    r.update();
    vi.advanceTimersByTime(500);
    r.update();
    r.update();
    expect(sent).toEqual([[box(1)]]);
  });

  test('at most one report per 50 ms; the last change is sent when the interval ends', () => {
    const r = make();
    rects = [box(1)];
    r.update();
    rects = [box(2)];
    r.update();
    vi.advanceTimersByTime(10);
    rects = [box(3)];
    r.update();
    rects = [box(4)];
    r.update();
    expect(sent).toEqual([[box(1)]]);
    vi.advanceTimersByTime(REPORT_INTERVAL_MS);
    expect(sent).toEqual([[box(1)], [box(4)]]);
    // Spacing between reports never drops below the interval.
    rects = [box(5)];
    r.update();
    // The last report went out at t=50; the change at t=60 is due at t=100.
    vi.advanceTimersByTime(REPORT_INTERVAL_MS - 11);
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(3);
  });

  test('a change that is undone before the interval ends sends nothing extra', () => {
    const r = make();
    rects = [box(1)];
    r.update();
    rects = [box(2)];
    r.update();
    rects = [box(1)];
    vi.advanceTimersByTime(100);
    expect(sent).toEqual([[box(1)]]);
  });

  test('after a quiet interval a change goes out immediately', () => {
    const r = make();
    rects = [box(1)];
    r.update();
    vi.advanceTimersByTime(60);
    rects = [];
    r.update();
    expect(sent).toEqual([[box(1)], []]);
  });

  test('dispose cancels a pending report', () => {
    const r = make();
    rects = [box(1)];
    r.update();
    rects = [box(2)];
    r.update();
    r.dispose();
    vi.advanceTimersByTime(200);
    expect(sent).toEqual([[box(1)]]);
  });
});

describe('collectHitRects', () => {
  function rectOf(l: number, t: number, w: number, h: number): DOMRect {
    return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h, x: l, y: t, toJSON: () => ({}) } as DOMRect;
  }
  /** happy-dom does no layout; give elements the boxes a real page would. */
  function build(opts: { bar?: boolean; resize?: boolean; bubble?: boolean } = {}) {
    document.body.innerHTML = `
      <div data-testid="happydesk-overlay"><div class="mascot"></div>
        <div class="bubble-slot"><div class="bubble"></div></div>
        ${opts.resize ? '<div class="resize"></div>' : ''}</div>
      ${opts.bar ? '<div class="bar-wrap"><div data-testid="happydesk-controls"></div></div>' : ''}`;
    const q = (s: string) => document.querySelector(s) as HTMLElement | null;
    q('[data-testid="happydesk-overlay"]')!.getBoundingClientRect = () => rectOf(100.4, 200.2, 120, 150);
    if (q('.resize')) q('.resize')!.getBoundingClientRect = () => rectOf(216, 346, 14, 14);
    q('.bubble')!.getBoundingClientRect = () => rectOf(190, 180, 50, 50);
    if (q('[data-testid="happydesk-controls"]')) q('[data-testid="happydesk-controls"]')!.getBoundingClientRect = () => rectOf(10, 356, 300, 150);
  }
  beforeEach(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1920, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 1080, configurable: true });
  });

  test('nothing is shown: no rectangles', () => {
    document.body.innerHTML = '';
    expect(collectHitRects()).toEqual([]);
  });

  test('the character alone, rounded outwards to whole pixels', () => {
    build();
    expect(collectHitRects()).toEqual([{ x: 100, y: 200, w: 121, h: 151 }]);
  });

  test('the control bar joins with padding that bridges the gap to the character', () => {
    build({ bar: true });
    const [ch, bar] = collectHitRects();
    expect(ch).toEqual({ x: 100, y: 200, w: 121, h: 151 });
    // Bar: 10..310 x 356..506 padded by 8 and clipped to the window on the left.
    expect(bar).toEqual({ x: 2, y: 348, w: 316, h: 166 });
    // The 6 px gap under the character (ends at y 351) is inside the padded bar.
    expect(bar!.y).toBeLessThanOrEqual(ch!.y + ch!.h);
    expect(BAR_PADDING).toBeGreaterThanOrEqual(6);
  });

  test('the resize handle that sticks out of the character is included', () => {
    build({ resize: true });
    expect(collectHitRects()).toHaveLength(2);
  });

  test('the bubble is left out unless asked for (it has pointer-events: none)', () => {
    build({ bubble: true });
    expect(collectHitRects()).toHaveLength(1);
    expect(collectHitRects(document, { includeBubble: true })).toHaveLength(2);
  });

  test('rectangles are clipped to the window and empty ones dropped', () => {
    build({ bar: true });
    (document.querySelector('[data-testid="happydesk-controls"]') as HTMLElement).getBoundingClientRect = () => rectOf(1800, 1000, 300, 150);
    const bar = collectHitRects()[1]!;
    expect(bar.x + bar.w).toBe(1920);
    expect(bar.y + bar.h).toBe(1080);
    (document.querySelector('[data-testid="happydesk-controls"]') as HTMLElement).getBoundingClientRect = () => rectOf(0, 0, 0, 0);
    expect(collectHitRects()).toHaveLength(1);
  });
});
