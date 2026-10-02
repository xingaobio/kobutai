import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SpriteRenderer, Stage, VideoRenderer } from './renderer';
import type { SpriteAsset, VideoAsset } from '../pack/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const sprite: SpriteAsset = { kind: 'sprite', src: 'x.svg', frames: 4, cols: 2, row: 1, fps: 10 };

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
