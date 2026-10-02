import { describe, expect, test } from 'vitest';
import { MAX_ASSET_BYTES, assetKey, syncLibrary, validateIndex } from './remote';
import { validatePack } from './pack/validate';

const ROOT = 'https://raw.githubusercontent.com/x/y/main/library/';

const pack = (id: string, src = 'sheet.webp') => ({
  id,
  name: id,
  tags: { type: ['music'], genre: ['electronic'] },
  size: { w: 192, h: 208 },
  states: {
    idle: { kind: 'sprite', src, frames: 8, cols: 8, row: 0, fps: 6 },
    playing: { kind: 'sprite', src, frames: 8, cols: 8, row: 1, fps: 10 },
  },
});

type Route = { json?: unknown; body?: BlobPart; type?: string; status?: number; length?: number };

function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) throw new TypeError('Failed to fetch');
    const headers: Record<string, string> = {};
    if (r.length !== undefined) headers['content-length'] = String(r.length);
    if (r.json !== undefined) return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers });
    return new Response(new Blob([r.body ?? 'x'], { type: r.type ?? '' }), { status: r.status ?? 200, headers });
  }) as typeof fetch;
  return { f, calls };
}

function store() {
  const blobs = new Map<string, Blob>();
  return { blobs, putBlob: async (k: string, b: Blob) => void blobs.set(k, b) };
}

describe('validateIndex', () => {
  test('accepts ids, rejects junk', () => {
    expect(validateIndex({ packs: ['dj-neko'] }).ok).toBe(true);
    expect(validateIndex({}).ok).toBe(false);
    expect(validateIndex({ packs: ['../evil'] }).ok).toBe(false);
    expect(validateIndex({ packs: Array.from({ length: 101 }, (_, i) => `p${i}`) }).ok).toBe(false);
  });
});

test('assetKey is stable, distinct and a valid hdblob id', () => {
  const a = assetKey(ROOT + 'a/sheet.webp');
  expect(a).toBe(assetKey(ROOT + 'a/sheet.webp'));
  expect(a).not.toBe(assetKey(ROOT + 'b/sheet.webp'));
  expect(validatePack({ ...pack('z'), states: { idle: { ...pack('z').states.idle, src: `hdblob:${a}` } } }).ok).toBe(true);
});

test('downloads packs, stores each asset once, rewrites src to hdblob refs', async () => {
  const { f, calls } = fakeFetch({
    [ROOT + 'index.json']: { json: { packs: ['dj-neko', 'broken', 'missing'] } },
    [ROOT + 'dj-neko/pack.json']: { json: pack('dj-neko') },
    // GitHub raw serves text/plain: type comes from the extension.
    [ROOT + 'dj-neko/sheet.webp']: { body: 'webp-bytes', type: 'text/plain' },
    [ROOT + 'broken/pack.json']: { json: { id: 'broken' } },
  });
  const s = store();
  const r = await syncLibrary(ROOT + 'index.json', { fetch: f, putBlob: s.putBlob });
  expect(r.packs.map((p) => p.id)).toEqual(['dj-neko']);
  expect(r.packs[0]!.source).toBe('remote');
  const src = r.packs[0]!.states.idle.src;
  expect(src).toMatch(/^hdblob:remote-[0-9a-f]{16}$/);
  expect(r.packs[0]!.states.playing!.src).toBe(src);
  expect(calls.filter((u) => u.endsWith('sheet.webp'))).toHaveLength(1);
  expect(s.blobs.size).toBe(1);
  expect([...s.blobs.values()][0]!.type).toBe('image/webp');
  expect(r.keys).toHaveLength(1);
  expect(r.errors).toEqual([expect.stringContaining('broken'), expect.stringContaining('missing')]);
  expect(r.failed).toEqual(['broken', 'missing']);
});

test.each([
  ['too large (header)', { body: 'x', type: 'image/png', length: MAX_ASSET_BYTES + 1 }],
  ['wrong type', { body: '<script>', type: 'text/html' }, 'evil.html'],
  ['http error', { status: 404, body: '' }],
])('rejects asset: %s', async (_, route, file = 'sheet.png') => {
  const { f } = fakeFetch({
    [ROOT + 'index.json']: { json: { packs: ['p'] } },
    [ROOT + 'p/pack.json']: { json: pack('p', file) },
    [ROOT + `p/${file}`]: route as Route,
  });
  const r = await syncLibrary(ROOT + 'index.json', { fetch: f, ...store() });
  expect(r.packs).toEqual([]);
  expect(r.errors).toHaveLength(1);
});

test('pack id must match its folder; remote packs cannot reference local blobs', async () => {
  const { f } = fakeFetch({
    [ROOT + 'index.json']: { json: { packs: ['a', 'b'] } },
    [ROOT + 'a/pack.json']: { json: pack('momo') },
    [ROOT + 'b/pack.json']: { json: pack('b', 'hdblob:petdex-boba') },
  });
  const r = await syncLibrary(ROOT + 'index.json', { fetch: f, ...store() });
  expect(r.packs).toEqual([]);
  expect(r.errors).toHaveLength(2);
});

test('offline or bad index fails the library without throwing', async () => {
  const { f } = fakeFetch({});
  const r = await syncLibrary(ROOT + 'index.json', { fetch: f, ...store() });
  expect(r).toMatchObject({ packs: [], keys: [] });
  expect(r.errors[0]).toMatch(/Failed to fetch/);
  expect((await syncLibrary('http://insecure.test/index.json', { fetch: f, ...store() })).errors[0]).toMatch(/https/);
});
