import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from '../llm/config';
import type { LocalTags } from './model/local';
import { TAG_CACHE_LIMIT, Tagger, type TagCacheStore } from './tagger';
import type { Tags } from './types';

const info = { site: 'www.youtube.com', title: 'Some Song (Official Music Video)', artist: 'Band' };

type CacheData = Record<string, { type: Tags['type']; genre: Tags['genre']; vclass?: Tags['vclass']; at: number }>;

function memCache(): TagCacheStore & { data: CacheData } {
  const c: TagCacheStore & { data: CacheData } = {
    data: {},
    get: async () => c.data,
    set: async (v) => void (c.data = v),
  };
  return c;
}

const on: LlmSettings = { ...DEFAULT_LLM_SETTINGS, enabled: true, provider: 'p', model: 'm' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('no AI configured → rules, no AI call', async () => {
  const ai = vi.fn();
  const t = new Tagger(async () => DEFAULT_LLM_SETTINGS, memCache(), ai);
  expect((await t.tag(info)).source).toBe('rules');
  expect(ai).not.toHaveBeenCalled();
});

test('AI answer is used and cached; second call hits cache', async () => {
  const ai = vi.fn(async (): Promise<Tags> => ({ type: 'music', genre: 'rock', source: 'ai' }));
  const cache = memCache();
  const t = new Tagger(async () => on, cache, ai);
  expect(await t.tag(info)).toEqual({ type: 'music', genre: 'rock', source: 'ai' });
  expect(await t.tag({ ...info, title: '  some song (official music video) ' })).toEqual({ type: 'music', genre: 'rock', source: 'cache' });
  expect(ai).toHaveBeenCalledTimes(1);
});

test('AI failure falls back to rules', async () => {
  const t = new Tagger(async () => on, memCache(), async () => null);
  expect((await t.tag(info)).source).toBe('rules');
});

test('slow AI falls back to rules but still fills the cache', async () => {
  let resolve!: (t: Tags) => void;
  const cache = memCache();
  const t = new Tagger(async () => on, cache, () => new Promise((r) => (resolve = r)), 100);
  const p = t.tag(info);
  await vi.advanceTimersByTimeAsync(150);
  expect((await p).source).toBe('rules');
  resolve({ type: 'music', genre: 'jpop', source: 'ai' });
  await vi.advanceTimersByTimeAsync(0);
  expect(Object.values(cache.data)).toEqual([expect.objectContaining({ genre: 'jpop' })]);
});

test('cache is bounded', async () => {
  const cache = memCache();
  for (let i = 0; i < TAG_CACHE_LIMIT; i++) cache.data[`k${i}`] = { type: 'video', genre: null, at: i };
  const t = new Tagger(async () => on, cache, async () => ({ type: 'music', genre: 'rock', source: 'ai' }));
  await t.tag(info);
  expect(Object.keys(cache.data)).toHaveLength(TAG_CACHE_LIMIT);
  expect(cache.data.k0).toBeUndefined();
});

// ---------------------------------------------------------------- with the on-device model

const sure = async (): Promise<LocalTags> => ({ type: 'music', genre: 'jpop', source: 'model', confidence: 0.97 });
const unsure = async (): Promise<LocalTags> => ({ type: 'music', genre: 'anime', source: 'model', confidence: 0.55 });

test('confident local answer is used without asking the AI', async () => {
  const ai = vi.fn();
  const t = new Tagger(async () => on, memCache(), ai, 100, sure);
  expect(await t.tag(info)).toEqual({ type: 'music', genre: 'jpop', source: 'model' });
  expect(ai).not.toHaveBeenCalled();
});

test('unsure local answer is handed to the AI', async () => {
  const ai = vi.fn(async (): Promise<Tags> => ({ type: 'music', genre: 'rock', source: 'ai' }));
  const t = new Tagger(async () => on, memCache(), ai, 100, unsure);
  expect(await t.tag(info)).toEqual({ type: 'music', genre: 'rock', source: 'ai' });
  expect(ai).toHaveBeenCalledTimes(1);
});

test('no AI configured → the local answer, even when unsure', async () => {
  const ai = vi.fn();
  const t = new Tagger(async () => DEFAULT_LLM_SETTINGS, memCache(), ai, 100, unsure);
  expect(await t.tag(info)).toEqual({ type: 'music', genre: 'anime', source: 'model' });
  expect(ai).not.toHaveBeenCalled();
});

test('AI failure or timeout falls back to the local answer, not the rules', async () => {
  const t = new Tagger(async () => on, memCache(), async () => null, 100, unsure);
  expect(await t.tag(info)).toMatchObject({ genre: 'anime', source: 'model' });
});

test('local model unavailable or throwing → keyword rules', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const none = new Tagger(async () => DEFAULT_LLM_SETTINGS, memCache(), vi.fn(), 100, async () => null);
  expect((await none.tag(info)).source).toBe('rules');
  const broken = new Tagger(async () => DEFAULT_LLM_SETTINGS, memCache(), vi.fn(), 100, async () => {
    throw new Error('boom');
  });
  expect((await broken.tag(info)).source).toBe('rules');
  warn.mockRestore();
});

test('video kind survives the AI cache', async () => {
  const cache = memCache();
  const ai = async (): Promise<Tags> => ({ type: 'video', genre: null, vclass: 'info', source: 'ai' });
  const t = new Tagger(async () => on, cache, ai, 100, unsure);
  await t.tag(info);
  expect(await t.tag(info)).toEqual({ type: 'video', genre: null, vclass: 'info', source: 'cache' });
});

test('an AI answer already in the cache wins over a confident local answer', async () => {
  const cache = memCache();
  const ai = vi.fn(async (): Promise<Tags> => ({ type: 'music', genre: 'anime', source: 'ai' }));
  await new Tagger(async () => on, cache, ai, 100, unsure).tag(info);
  const t = new Tagger(async () => on, cache, ai, 100, sure);
  expect(await t.tag(info)).toEqual({ type: 'music', genre: 'anime', source: 'cache' });
  expect(ai).toHaveBeenCalledTimes(1);
});

test('an AI answer without a video kind keeps the local one', async () => {
  const localVideo = async (): Promise<LocalTags> => ({ type: 'video', genre: null, vclass: 'ent', source: 'model', confidence: 0.6 });
  const t = new Tagger(async () => on, memCache(), async () => ({ type: 'video', genre: null, source: 'ai' }), 100, localVideo);
  expect(await t.tag(info)).toEqual({ type: 'video', genre: null, vclass: 'ent', source: 'ai' });
});
