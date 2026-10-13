import { describe, expect, test, vi } from 'vitest';
import type { MediaSnapshot } from '../media/types';
import type { PackManifest } from '../pack/types';
import type { Tags } from '../tagging/types';
import { GachaEngine, RECENT_LIMIT, infoOf, type GachaDeps, type GachaState } from './engine';
import { pick, poolFor } from './pool';

type P = Pick<PackManifest, 'id' | 'tags'>;
const P = (id: string, type: string[], genre: string[]) => ({ id, tags: { type, genre } }) as P;

const PACKS: P[] = [
  P('jp1', ['music'], ['jpop', 'anime']),
  P('jp2', ['music'], ['jpop']),
  P('rock', ['music'], ['rock']),
  P('prof', ['video', 'podcast'], []),
  P('gen1', [], []),
  P('gen2', [], []),
];

describe('poolFor', () => {
  test('genre pool', () => {
    expect(poolFor(PACKS, { type: 'music', genre: 'jpop' }).map((p) => p.id)).toEqual(['jp1', 'jp2']);
  });
  test('empty genre pool falls back to generic', () => {
    expect(poolFor(PACKS, { type: 'music', genre: 'classical' }).map((p) => p.id)).toEqual(['gen1', 'gen2']);
  });
  test('non-music uses type-specific packs', () => {
    expect(poolFor(PACKS, { type: 'video', genre: null }).map((p) => p.id)).toEqual(['prof']);
    expect(poolFor(PACKS, { type: 'live', genre: null }).map((p) => p.id)).toEqual(['gen1', 'gen2']);
  });
  test('no generic packs → everything', () => {
    expect(poolFor(PACKS.slice(0, 3), { type: 'other', genre: null })).toHaveLength(3);
  });
  test('a known video kind prefers packs made for it, else any video pack', () => {
    const packs = [
      { id: 'popo', tags: { type: ['video', 'live'], genre: [], vclass: ['ent'] } },
      { id: 'tingting', tags: { type: ['video', 'podcast'], genre: [], vclass: ['info'] } },
      { id: 'prof', tags: { type: ['video'], genre: [] } },
    ] as P[];
    const ids = (t: Parameters<typeof poolFor>[1]) => poolFor(packs, t).map((p) => p.id);
    expect(ids({ type: 'video', genre: null, vclass: 'ent' })).toEqual(['popo']);
    expect(ids({ type: 'video', genre: null, vclass: 'info' })).toEqual(['tingting']);
    expect(ids({ type: 'video', genre: null })).toEqual(['popo', 'tingting', 'prof']);
    expect(ids({ type: 'podcast', genre: null })).toEqual(['tingting']);
    // No pack lists the kind → every video pack, as before.
    expect(poolFor(PACKS, { type: 'video', genre: null, vclass: 'ent' }).map((p) => p.id)).toEqual(['prof']);
  });
  test('a stored pack with a malformed video kind does not break drawing', () => {
    const packs = [
      { id: 'bad', tags: { type: ['video'], genre: [], vclass: 1 } },
      { id: 'sub', tags: { type: ['video'], genre: [], vclass: 'entertainment' } },
      { id: 'ok', tags: { type: ['video'], genre: [] } },
    ] as unknown as P[];
    expect(poolFor(packs, { type: 'video', genre: null, vclass: 'ent' }).map((p) => p.id)).toEqual(['bad', 'sub', 'ok']);
  });
  test('genre packs restricted to another type are excluded', () => {
    const packs = [P('weird', ['video'], ['jpop']), P('g', [], [])];
    expect(poolFor(packs, { type: 'music', genre: 'jpop' }).map((p) => p.id)).toEqual(['g']);
  });
});

test('pick is uniform over the range and handles empty', () => {
  expect(pick([], Math.random)).toBeUndefined();
  expect(pick(['a', 'b', 'c'], () => 0)).toBe('a');
  expect(pick(['a', 'b', 'c'], () => 0.999)).toBe('c');
  expect(pick(['a', 'b', 'c'], () => 0.5)).toBe('b');
});

const snap = (title: string, playing = true, site = 'www.youtube.com'): MediaSnapshot => ({
  playing, currentTime: 0, duration: 100, volume: 1, muted: false, title, artist: 'x',
  canNext: false, canPrev: false, canSeek: true, adapter: 'youtube', site,
});

function setup(opts: { tags?: (title: string) => Tags; locked?: string | null; saved?: GachaState | null; packs?: P[] } = {}) {
  let n = 0;
  const recorded: string[] = [];
  const saves: GachaState[] = [];
  const state = { locked: opts.locked ?? null };
  const tag = vi.fn(async (info: { title: string }) =>
    opts.tags ? opts.tags(info.title) : ({ type: 'music', genre: 'jpop', source: 'rules' } as Tags),
  );
  const deps: GachaDeps = {
    packs: async () => opts.packs ?? PACKS,
    tag,
    // Deterministic rng cycling 0, 0.5, 0.99…
    rng: () => [0, 0.5, 0.99][n++ % 3]!,
    locked: async () => state.locked,
    record: async (id) => void recorded.push(id),
    load: async () => opts.saved ?? null,
    save: async (s) => void saves.push(s),
  };
  return { engine: new GachaEngine(deps), recorded, saves, tag, state };
}

describe('GachaEngine', () => {
  test('draws once per new content from the matching pool and records it', async () => {
    const { engine, recorded, tag } = setup();
    expect(await engine.onMedia(snap('A'))).toBe(true);
    const v = (await engine.view())!;
    expect(['jp1', 'jp2']).toContain(v.packId);
    expect(v).toMatchObject({ locked: false, canReroll: true });
    // Same content again (progress updates, pause/resume) → no new draw.
    expect(await engine.onMedia(snap('A'))).toBe(false);
    expect(await engine.onMedia(snap('A', false))).toBe(false);
    expect(await engine.onMedia(snap('A'))).toBe(false);
    expect(tag).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveLength(1);
  });

  test('paused or untitled media never triggers a draw', async () => {
    const { engine, tag } = setup();
    expect(await engine.onMedia(snap('A', false))).toBe(false);
    expect(await engine.onMedia(snap(''))).toBe(false);
    expect(await engine.onMedia(null)).toBe(false);
    expect(tag).not.toHaveBeenCalled();
    expect(await engine.view()).toBeNull();
  });

  test('switching back to earlier content restores its draw without redrawing', async () => {
    const { engine, tag } = setup();
    await engine.onMedia(snap('A'));
    const a = (await engine.view())!.packId;
    await engine.onMedia(snap('B'));
    expect(await engine.onMedia(snap('A'))).toBe(true);
    expect((await engine.view())!.packId).toBe(a);
    expect(tag).toHaveBeenCalledTimes(2);
  });

  test('reroll: once, same pool, different pack, recorded', async () => {
    const { engine, recorded } = setup();
    await engine.onMedia(snap('A'));
    const first = (await engine.view())!.packId;
    expect(await engine.reroll()).toBe(true);
    const v = (await engine.view())!;
    expect(v.packId).not.toBe(first);
    expect(['jp1', 'jp2']).toContain(v.packId);
    expect(v.canReroll).toBe(false);
    expect(await engine.reroll()).toBe(false);
    expect(recorded).toHaveLength(2);
    // Reroll survives switching away and back (cannot reroll again).
    await engine.onMedia(snap('B'));
    await engine.onMedia(snap('A'));
    expect((await engine.view())!).toMatchObject({ packId: v.packId, canReroll: false });
  });

  test('reroll unavailable when the pool has a single pack', async () => {
    const { engine } = setup({ tags: () => ({ type: 'video', genre: null, source: 'rules' }) });
    await engine.onMedia(snap('lecture'));
    expect((await engine.view())!).toMatchObject({ packId: 'prof', canReroll: false });
    expect(await engine.reroll()).toBe(false);
  });

  test('lock pins the character and stops draws and AI calls', async () => {
    const { engine, tag, state, recorded } = setup({ locked: 'rock' });
    expect(await engine.onMedia(snap('A'))).toBe(false);
    expect(await engine.view()).toMatchObject({ packId: 'rock', locked: true, canReroll: false });
    expect(await engine.reroll()).toBe(false);
    expect(tag).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
    state.locked = null;
    expect(await engine.onMedia(snap('B'))).toBe(true);
    expect((await engine.view())!.locked).toBe(false);
  });

  test('lock on a pack that does not exist here is ignored entirely', async () => {
    const { engine, tag } = setup({ locked: 'petdex-only-on-other-device' });
    expect(await engine.view()).toBeNull();
    // Draws and rerolls still work.
    expect(await engine.onMedia(snap('A'))).toBe(true);
    expect(tag).toHaveBeenCalled();
    expect((await engine.view())!).toMatchObject({ locked: false, canReroll: true });
    expect(await engine.reroll()).toBe(true);
  });

  test('a failing collection write does not block the draw', async () => {
    const t = setup();
    const deps = (t.engine as unknown as { deps: GachaDeps }).deps;
    deps.record = async () => {
      throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
    };
    expect(await t.engine.onMedia(snap('A'))).toBe(true);
    expect(await t.engine.reroll()).toBe(true);
  });

  test('concurrent snapshots for the same content draw once; stale draws do not win', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { engine, tag } = setup({
      tags: () => ({ type: 'music', genre: 'rock', source: 'rules' }),
    });
    const slowTag = tag.getMockImplementation()!;
    tag.mockImplementation(async (info) => {
      if (info.title === 'slow') await gate;
      return slowTag(info);
    });
    const p1 = engine.onMedia(snap('slow'));
    const p2 = engine.onMedia(snap('slow'));
    const p3 = engine.onMedia(snap('fast'));
    expect(await p3).toBe(true);
    release();
    expect(await p1).toBe(false);
    expect(await p2).toBe(false);
    expect(tag.mock.calls.filter(([i]) => i.title === 'slow')).toHaveLength(1);
  });

  test('state persists and is restored', async () => {
    const { engine, saves } = setup();
    await engine.onMedia(snap('A'));
    const saved = saves.at(-1)!;
    const restored = setup({ saved }).engine;
    expect((await restored.view())!.packId).toBe(saved.current!.packId);
    // Restored recent map prevents redraw.
    expect(await restored.onMedia(snap('A'))).toBe(false);
  });

  test('recent list is bounded', async () => {
    const { engine, saves } = setup();
    for (let i = 0; i < RECENT_LIMIT + 5; i++) await engine.onMedia(snap(`song ${i}`));
    expect(saves.at(-1)!.recent).toHaveLength(RECENT_LIMIT);
  });
});

test('infoOf passes a known duration only', () => {
  const snap = { title: 'T', artist: 'A', site: 's.com', duration: 213 } as MediaSnapshot;
  expect(infoOf(snap)).toEqual({ title: 'T', artist: 'A', site: 's.com', duration: 213 });
  expect(infoOf({ ...snap, duration: 0 })).toEqual({ title: 'T', artist: 'A', site: 's.com' });
});

test('the video-kind preference picks the first character; "change once" can use any video character', async () => {
  const packs = [
    { id: 'popo', tags: { type: ['video'], genre: [], vclass: ['ent'] } },
    { id: 'tingting', tags: { type: ['video'], genre: [], vclass: ['info'] } },
  ] as P[];
  const { engine } = setup({ packs, tags: () => ({ type: 'video', genre: null, vclass: 'ent', source: 'model' }) });
  await engine.onMedia(snap('Funny video'));
  expect(await engine.view()).toMatchObject({ packId: 'popo', canReroll: true, tags: { vclass: 'ent' } });
  expect(await engine.reroll()).toBe(true);
  expect((await engine.view())!.packId).toBe('tingting');
});

test('infoOf marks live streams', () => {
  const s = { title: 'T', artist: 'A', site: 's.com', duration: 0, live: true } as MediaSnapshot;
  expect(infoOf(s)).toEqual({ title: 'T', artist: 'A', site: 's.com', live: true });
});
