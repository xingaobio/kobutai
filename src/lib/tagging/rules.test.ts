import { expect, test } from 'vitest';
import { TITLE_CASES } from '../../../tests/fixtures/titles';
import { ruleTags } from './rules';
import { contentKey, isTags } from './types';

test(`rule tagger accuracy on ${TITLE_CASES.length} real-world titles is ≥ 80%`, () => {
  const misses: string[] = [];
  for (const c of TITLE_CASES) {
    const t = ruleTags(c);
    if (t.type !== c.type || t.genre !== c.genre)
      misses.push(`${c.title}: got ${t.type}/${t.genre}, want ${c.type}/${c.genre}`);
  }
  const accuracy = 1 - misses.length / TITLE_CASES.length;
  console.info(`tagger misses (${(accuracy * 100).toFixed(0)}% accurate):\n  ` + misses.join('\n  '));
  expect(TITLE_CASES.length).toBeGreaterThanOrEqual(30);
  expect(accuracy).toBeGreaterThanOrEqual(0.8);
});

test('non-music content has no genre', () => {
  expect(ruleTags({ site: 'www.youtube.com', title: 'Unboxing my new desk', artist: 'Someone' })).toEqual({
    type: 'video',
    genre: null,
    source: 'rules',
  });
});

test('contentKey normalises whitespace, case and width', () => {
  expect(contentKey({ site: 'A.com', title: ' Ｈello  World ', artist: 'X' })).toBe(
    contentKey({ site: 'a.com', title: 'hello world', artist: 'x' }),
  );
});

test('isTags validates enums', () => {
  expect(isTags({ type: 'music', genre: 'jpop' })).toBe(true);
  expect(isTags({ type: 'video', genre: null })).toBe(true);
  expect(isTags({ type: 'music', genre: 'polka' })).toBe(false);
  expect(isTags({ type: 'tv', genre: null })).toBe(false);
  expect(isTags(null)).toBe(false);
});

test.each([
  ['Ed Sheeran - Shape of You (Official Music Video)', 'Ed Sheeran', 'western-pop'],
  ['Lil Baby - Drip Too Hard', 'Lil Baby', 'hiphop'],
])('regressions: %s → %s', (title, artist, genre) => {
  expect(ruleTags({ site: 'www.youtube.com', title, artist })).toMatchObject({ type: 'music', genre });
});
