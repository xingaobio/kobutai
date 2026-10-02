import { expect, test } from 'vitest';
import { vi } from 'vitest';
import { DataUrlCache, blobKey, blobRef, blobToDataUrl, isBlobRef } from './blobstore';

test('blob refs', () => {
  expect(blobRef('petdex-boba')).toBe('hdblob:petdex-boba');
  expect(isBlobRef('hdblob:x')).toBe(true);
  expect(isBlobRef('data:image/png;base64,')).toBe(false);
  expect(blobKey('hdblob:petdex-boba')).toBe('petdex-boba');
});

test('blobToDataUrl encodes large blobs', async () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  const url = await blobToDataUrl(new Blob([bytes], { type: 'image/webp' }));
  expect(url.startsWith('data:image/webp;base64,')).toBe(true);
  const decoded = Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0));
  expect(decoded).toEqual(bytes);
});

test('DataUrlCache encodes once, evicts LRU, does not cache misses', async () => {
  const load = vi.fn(async (k: string) => (k === 'missing' ? undefined : new Blob([k], { type: 'image/png' })));
  const c = new DataUrlCache(load, 2);
  expect(await c.get('a')).toMatch(/^data:image\/png;base64,/);
  await c.get('a');
  expect(load).toHaveBeenCalledTimes(1);
  await c.get('b');
  await c.get('c'); // evicts a
  await c.get('a');
  expect(load).toHaveBeenCalledTimes(4);
  expect(await c.get('missing')).toBeNull();
  await c.get('missing');
  expect(load.mock.calls.filter(([k]) => k === 'missing')).toHaveLength(2);
});
