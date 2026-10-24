import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { TITLE_CASES } from '../../../../tests/fixtures/titles';
import { moodOf } from '../../dialogue/dialogue';
import { ruleTags } from '../rules';
import type { Classification } from './classifier';
import { HANDOFF_CONFIDENCE, LocalModel, MODEL_FILES, confidenceOf, toTags, type FileFetcher } from './local';

/** Tests run from the repository root. */
const root = (p: string) => resolve(process.cwd(), p);

/** Serves public/ from disk, as the extension serves it at runtime. */
function diskFetcher(): FileFetcher & { calls: string[] } {
  const calls: string[] = [];
  const read = (p: string) => {
    calls.push(p);
    return readFileSync(root(`public${p}`));
  };
  return {
    calls,
    json: async (p) => JSON.parse(read(p).toString('utf8')) as unknown,
    bytes: async (p) => {
      const b = read(p);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
    text: async (p) => read(p).toString('utf8'),
  };
}

const base: Classification = {
  type: 'music',
  typeConfidence: 0.95,
  typeVia: 'model',
  genre: 'rock',
  genreConfidence: 0.8,
  genreVia: 'table',
  vclass: null,
  vclassConfidence: 0,
};

describe('mapping model answers to tags', () => {
  test('music keeps its genre; confidence is the weaker of the two', () => {
    expect(toTags(base)).toEqual({ type: 'music', genre: 'rock', source: 'model', confidence: 0.8 });
  });
  test('music without a confident genre goes to the generic pool', () => {
    const t = toTags({ ...base, genre: null, genreVia: null, genreConfidence: 0.2 });
    expect(t).toMatchObject({ type: 'music', genre: null, confidence: 0 });
  });
  test('no confident type → "other" (generic pool)', () => {
    expect(toTags({ ...base, type: null, genre: null })).toMatchObject({ type: 'other', genre: null, confidence: 0 });
  });
  test('video carries its class', () => {
    const t = toTags({ ...base, type: 'video', genre: null, vclass: 'info', vclassConfidence: 0.7 });
    expect(t).toEqual({ type: 'video', genre: null, vclass: 'info', source: 'model', confidence: 0.7 });
  });
  test('live and podcast use the type confidence', () => {
    expect(confidenceOf({ ...base, type: 'podcast', genre: null, typeConfidence: 1 })).toBe(1);
  });
});

describe('LocalModel', () => {
  test('loads the packaged files once and tags media', async () => {
    const files = diskFetcher();
    const m = new LocalModel(files);
    const a = await m.tag({ site: 'www.youtube.com', title: 'lofi hip hop radio 📚 beats to relax/study to', artist: 'Lofi Girl' });
    const b = await m.tag({ site: 'www.bilibili.com', title: '黎曼猜想到底是什么？', artist: '李永乐老师', duration: 1502 });
    expect(a).toMatchObject({ type: 'music', genre: 'lofi', source: 'model' });
    expect(b).toMatchObject({ type: 'video', vclass: 'info' });
    expect(files.calls.sort()).toEqual(Object.values(MODEL_FILES).sort());
  });

  test('a failed load returns null (caller falls back to rules) and is not retried per call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files: FileFetcher = {
      json: vi.fn(async () => {
        throw new Error('offline');
      }),
      bytes: vi.fn(async () => new ArrayBuffer(0)),
      text: vi.fn(async () => ''),
    };
    const m = new LocalModel(files);
    expect(await m.tag({ site: 'a.com', title: 'x', artist: '' })).toBeNull();
    expect(await m.tag({ site: 'a.com', title: 'y', artist: '' })).toBeNull();
    expect(files.json).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('a corrupt model file returns null instead of throwing, and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const files = diskFetcher();
    const m = new LocalModel({ ...files, bytes: async () => new ArrayBuffer(20) });
    expect(await m.tag({ site: 'a.com', title: 'x', artist: '' })).toBeNull();
    expect(await m.tag({ site: 'a.com', title: 'y', artist: '' })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('concurrent first calls load the files once', async () => {
    const files = diskFetcher();
    const m = new LocalModel(files);
    await Promise.all([1, 2, 3].map((i) => m.tag({ site: 'a.com', title: `t${i}`, artist: '' })));
    expect(files.calls).toHaveLength(3);
  });

  test('a live stream is never read as an ordinary video', async () => {
    const m = new LocalModel(diskFetcher());
    const chat = { site: 'www.youtube.com', title: '【雑談】ゆるりと雑談しつつ金曜日を謳歌する配信', artist: 'some vtuber' };
    expect((await m.tag({ ...chat, live: true }))?.type).toMatch(/^(live|music)$/);
    expect((await m.tag({ site: 'live.bilibili.com', title: '晚间杂谈 来聊天', artist: '某主播' }))?.type).toBe('live');
  });
});

interface RealCase {
  site: string;
  title: string;
  artist: string;
  duration: number;
  type: string;
  genre: string | null;
  vclass: string | null;
}
const REAL = (JSON.parse(readFileSync(root('tests/fixtures/real-titles.json'), 'utf8')) as { cases: RealCase[] }).cases;

/** "Fully right" ignores vclass here because the keyword rules don't produce it. */
async function score(cases: readonly { site: string; title: string; artist: string; duration?: number; type: string; genre: string | null }[]) {
  const m = new LocalModel(diskFetcher());
  let model = 0;
  let rules = 0;
  const misses: string[] = [];
  for (const c of cases) {
    // As at runtime: players report live streams and unknown lengths as 0.
    const info = { site: c.site, title: c.title, artist: c.artist, duration: c.duration && c.duration > 0 ? c.duration : 0 };
    const t = await m.tag(info);
    const r = ruleTags(info);
    if (t && t.type === c.type && t.genre === c.genre) model++;
    else misses.push(`${c.title}: got ${t?.type}/${t?.genre}, want ${c.type}/${c.genre}`);
    if (r.type === c.type && r.genre === c.genre) rules++;
  }
  return { model: model / cases.length, rules: rules / cases.length, misses };
}

describe('accuracy', () => {
  test(`real titles (${REAL.length}, scraped from charts and trending pages): model clearly beats the keyword rules`, async () => {
    const r = await score(REAL);
    console.info(`real titles: local model ${(r.model * 100).toFixed(1)}%, keyword rules ${(r.rules * 100).toFixed(1)}%`);
    expect(REAL.length).toBeGreaterThan(300);
    expect(r.model).toBeGreaterThanOrEqual(0.8);
    expect(r.model - r.rules).toBeGreaterThanOrEqual(0.1);
  });

  test(`hand-labelled titles (${TITLE_CASES.length})`, async () => {
    const r = await score(TITLE_CASES);
    console.info(
      `hand-labelled: local model ${(r.model * 100).toFixed(1)}%, keyword rules ${(r.rules * 100).toFixed(1)}%; model misses:\n  ` +
        r.misses.join('\n  '),
    );
    // The rules were written against these very titles, so they are not the bar here.
    expect(r.model).toBeGreaterThanOrEqual(0.85);
  });

  test('hand-off threshold matches the research (0.9)', () => {
    expect(HANDOFF_CONFIDENCE).toBe(0.9);
  });
});

test('character lines: what the model is sure of is rarely the wrong mood (real titles)', async () => {
  const m = new LocalModel(diskFetcher());
  let said = 0;
  let wrong = 0;
  for (const c of REAL) {
    const t = (await m.tag({ site: c.site, title: c.title, artist: c.artist, duration: c.duration > 0 ? c.duration : 0 }))!;
    // As the tagger hands it on: under the hand-off line the answer is marked unsure.
    const mood = moodOf({ ...t, ...(t.confidence < HANDOFF_CONFIDENCE ? { unsure: true as const } : {}) });
    if (mood === null || mood === 'any') continue;
    said++;
    if (mood !== moodOf({ type: c.type as never, genre: c.genre as never, ...(c.vclass ? { vclass: c.vclass as never } : {}) })) wrong++;
  }
  console.info(`mood lines on real titles: ${said} said, ${wrong} wrong`);
  // Measured 2026-10-24: 222 said, 6 wrong (without the gate: 332 said, 43 wrong).
  expect(said).toBeGreaterThan(REAL.length / 2);
  expect(wrong / said).toBeLessThan(0.05);
});
