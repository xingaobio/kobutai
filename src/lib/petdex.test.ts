import { describe, expect, test } from 'vitest';
import { validatePack } from './pack/validate';
import { countFrames, gridFor, parseManifest, safeSlug, searchPets, toPack } from './petdex';

describe('parseManifest', () => {
  test('keeps valid https entries only', () => {
    const pets = parseManifest({
      generatedAt: 'x',
      total: 3,
      pets: [
        { slug: 'boba', displayName: 'Boba', kind: 'cat', submittedBy: 'ann', spritesheetUrl: 'https://assets.petdex.dev/pets/boba/sprite.webp', petJsonUrl: 'https://assets.petdex.dev/pets/boba/petjson.json' },
        { slug: 'evil', spritesheetUrl: 'http://evil.test/a.webp' },
        { displayName: 'no slug', spritesheetUrl: 'https://x/a.webp' },
        { slug: 'plain', spritesheetUrl: 'https://assets.petdex.dev/pets/plain/sprite.webp', petJsonUrl: 'javascript:x' },
      ],
    });
    expect(pets.map((p) => p.slug)).toEqual(['boba', 'plain']);
    expect(pets[1]).toMatchObject({ displayName: 'plain', petJsonUrl: undefined });
  });

  test('rejects a malformed manifest', () => {
    expect(() => parseManifest({})).toThrow();
  });

  test('search by slug or name', () => {
    const pets = parseManifest({ pets: [
      { slug: 'pikachu-fan', displayName: 'Electric Mouse', spritesheetUrl: 'https://a/1' },
      { slug: 'boba', displayName: 'Boba Cat', spritesheetUrl: 'https://a/2' },
    ] });
    expect(searchPets(pets, 'CAT').map((p) => p.slug)).toEqual(['boba']);
    expect(searchPets(pets, 'pika').map((p) => p.slug)).toEqual(['pikachu-fan']);
    expect(searchPets(pets, '', 1)).toHaveLength(1);
  });
});

describe('gridFor', () => {
  test('v1 and v2 sheets, and scaled sheets', () => {
    expect(gridFor(1536, 1872)).toEqual({ cellW: 192, cellH: 208, rows: 9 });
    expect(gridFor(1536, 2288).rows).toBe(11);
    expect(gridFor(768, 936)).toEqual({ cellW: 96, cellH: 104, rows: 9 });
  });
  test('rejects non-Petdex images', () => {
    expect(() => gridFor(1000, 1000)).toThrow();
    expect(() => gridFor(1536, 1000)).toThrow();
  });
});

/** Synthetic sheet: `used[row]` cells in that row get an opaque pixel. */
function sheet(used: number[], w = 96, h = 104): { width: number; height: number; data: Uint8ClampedArray } {
  const width = w * 8;
  const height = h * 9;
  const data = new Uint8ClampedArray(width * height * 4);
  used.forEach((n, row) => {
    for (let col = 0; col < n; col++) {
      const x = col * w + Math.floor(w / 2);
      const y = row * h + Math.floor(h / 2);
      // Paint a small block so the sampler can't miss it.
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) data[((y + dy) * width + (x + dx)) * 4 + 3] = 255;
    }
  });
  return { width, height, data };
}

test('countFrames finds the used cells per row', () => {
  expect(countFrames(sheet([8, 8, 8, 4, 5, 8, 6, 8, 0]))).toEqual([8, 8, 8, 4, 5, 8, 6, 8, 1]);
});

test('toPack maps Petdex rows to states and yields a valid pack', () => {
  const pack = toPack({ slug: 'Boba Cat!', displayName: 'Boba', submittedBy: 'ann' }, 'data:image/webp;base64,AAAA', [8, 8, 8, 4, 5, 3, 6, 7, 2]);
  expect(pack.id).toBe('petdex-boba-cat');
  expect(pack.source).toBe('petdex');
  expect(pack.tags).toEqual({ type: [], genre: [] });
  expect(pack.states.idle).toMatchObject({ row: 0, frames: 8 });
  expect(pack.states.playing).toMatchObject({ row: 7, frames: 7 });
  expect(pack.states.paused).toMatchObject({ row: 6, frames: 6 });
  expect(pack.states.appear).toMatchObject({ row: 3, frames: 4, loop: false });
  expect(pack.states.click).toMatchObject({ row: 4, frames: 5, loop: false });
  expect(pack.states.error).toMatchObject({ row: 5, frames: 3 });
  expect(validatePack(pack).ok).toBe(true);
});

test('safeSlug', () => {
  expect(safeSlug('../../etc')).toBe('etc');
  expect(safeSlug('!!!')).toBe('pet');
});
