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
