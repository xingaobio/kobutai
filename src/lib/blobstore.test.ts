import { expect, test } from 'vitest';
import { blobKey, blobRef, blobToDataUrl, isBlobRef } from './blobstore';

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
