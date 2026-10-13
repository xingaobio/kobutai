import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SpriteRenderer, Stage, VideoRenderer } from './renderer';
import type { SpriteAsset, VideoAsset } from '../pack/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sprite: SpriteAsset = { kind: 'sprite', src: 'chrome-extension://abc/packs/x.svg', frames: 4, cols: 2, row: 1, fps: 10 };

test('sprite steps through frames across rows', () => {
  const r = new SpriteRenderer({ w: 100, h: 50 });
  r.show(sprite);
  expect(r.el.style.backgroundPosition).toBe('0px -50px');
  vi.advanceTimersByTime(100);
  expect(r.el.style.backgroundPosition).toBe('-100px -50px');
  vi.advanceTimersByTime(100);
  expect(r.el.style.backgroundPosition).toBe('0px -100px');
  vi.advanceTimersByTime(200);
  expect(r.currentFrame).toBe(0); // looped
  r.destroy();
});

test('non-looping sprite fires onEnd once and stops', () => {
  const r = new SpriteRenderer({ w: 10, h: 10 });
  const onEnd = vi.fn();
  r.show({ ...sprite, loop: false }, onEnd);
  vi.advanceTimersByTime(1000);
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(r.currentFrame).toBe(4);
  r.destroy();
});

test('stage swaps renderer by asset kind', () => {
  const host = document.createElement('div');
  const stage = new Stage(host, { w: 10, h: 10 });
  stage.show(sprite);
  expect(host.firstElementChild?.tagName).toBe('DIV');
  const video: VideoAsset = { kind: 'video', src: 'https://x/a.webm' };
  stage.show(video);
  expect(host.firstElementChild?.tagName).toBe('VIDEO');
  expect((host.firstElementChild as HTMLElement).dataset.happydesk).toBe('true');
  stage.destroy();
});

test('renderers reject the wrong asset kind', () => {
  expect(() => new SpriteRenderer({ w: 1, h: 1 }).show({ kind: 'video', src: 'a' })).toThrow();
  expect(() => new VideoRenderer({ w: 1, h: 1 }).show(sprite)).toThrow();
});

test('non-extension sprites are drawn on a canvas from a fetched bitmap', async () => {
  const drawImage = vi.fn();
  const ctx = { clearRect: vi.fn(), drawImage };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  const bmp = { width: 400, height: 520 } as ImageBitmap;
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bmp));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))));

  const r = new SpriteRenderer({ w: 100, h: 130 });
  r.show({ kind: 'sprite', src: 'data:image/webp;base64,AAAA', frames: 2, cols: 4, row: 1, fps: 10 });
  expect(r.el.querySelector('canvas')).not.toBeNull();
  expect(r.el.style.backgroundImage).toBe('none');
  await vi.waitFor(() => expect(drawImage).toHaveBeenCalled());
  // 400px / 4 cols = 100px source cells, 130px tall; row 1.
  expect(drawImage).toHaveBeenLastCalledWith(bmp, 0, 130, 100, 130, 0, 0, 100, 130);
  vi.advanceTimersByTime(100);
  expect(drawImage).toHaveBeenLastCalledWith(bmp, 100, 130, 100, 130, 0, 0, 100, 130);
  r.destroy();
  getContext.mockRestore();
  vi.unstubAllGlobals();
});

test('a still sprite holds its first frame and never ends', () => {
  const r = new SpriteRenderer({ w: 100, h: 50 });
  const onEnd = vi.fn();
  r.show({ ...sprite, loop: false }, onEnd, { still: true });
  expect(r.el.style.backgroundPosition).toBe('0px -50px');
  vi.advanceTimersByTime(2000);
  expect(r.el.style.backgroundPosition).toBe('0px -50px');
  expect(r.currentFrame).toBe(0);
  expect(onEnd).not.toHaveBeenCalled();
  // Showing it again without `still` animates as usual.
  r.show(sprite);
  vi.advanceTimersByTime(100);
  expect(r.el.style.backgroundPosition).toBe('-100px -50px');
  r.destroy();
});

test('a still video is loaded but not played; a normal one plays', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const r = new VideoRenderer({ w: 10, h: 10 });
  const video: VideoAsset = { kind: 'video', src: 'https://x/a.webm' };
  r.show(video, undefined, { still: true });
  expect(r.el.autoplay).toBe(false);
  expect(r.el.src).toBe('https://x/a.webm');
  expect(play).not.toHaveBeenCalled();
  expect(pause).toHaveBeenCalled();
  r.show(video);
  expect(r.el.autoplay).toBe(true);
  expect(play).toHaveBeenCalledTimes(1);
  r.destroy();
  play.mockRestore();
  pause.mockRestore();
});

test('stage passes the still option through', () => {
  const host = document.createElement('div');
  const stage = new Stage(host, { w: 100, h: 50 });
  stage.show(sprite, undefined, { still: true });
  vi.advanceTimersByTime(500);
  expect((host.firstElementChild as HTMLElement).style.backgroundPosition).toBe('0px -50px');
  stage.destroy();
});

test('a still sprite can hold a chosen frame', () => {
  const r = new SpriteRenderer({ w: 100, h: 50 });
  r.show(sprite, undefined, { still: true, frame: 3 });
  // Frame 3 of a 2-column sheet starting on row 1: column 1, row 2.
  expect(r.el.style.backgroundPosition).toBe('-100px -100px');
  vi.advanceTimersByTime(1000);
  expect(r.currentFrame).toBe(3);
  // Out-of-range frames are clamped; an animating sprite ignores `frame`.
  r.show(sprite, undefined, { still: true, frame: 99 });
  expect(r.currentFrame).toBe(3);
  r.show(sprite, undefined, { frame: 2 });
  expect(r.currentFrame).toBe(0);
  r.destroy();
});

