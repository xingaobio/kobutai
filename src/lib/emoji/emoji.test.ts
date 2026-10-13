import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { bubbleFor, KAOMOJI } from './kaomoji';
import { EVENT_EMOJI, pickEmoji } from './pick';
import { EMOJI_CELL, EMOJI_COLS, EMOJI_SHEETS, type EmojiName } from './sheets.gen';

const song = (title: string, artist = '') => ({ title, artist });

describe('pickEmoji', () => {
  test('genre decides for ordinary songs', () => {
    expect(['guitar', 'rock-hand']).toContain(pickEmoji(song('Numb', 'Linkin Park'), { type: 'music', genre: 'rock' }));
    expect(pickEmoji(song('Nocturne Op. 9 No. 2', 'Chopin'), { type: 'music', genre: 'classical' })).toBe('violin');
    expect(pickEmoji(song('lofi beats', 'Lofi Girl'), { type: 'music', genre: 'lofi' })).toBe('coffee');
    expect(['mirror-ball', 'dancer']).toContain(pickEmoji(song('Faded', 'Alan Walker'), { type: 'music', genre: 'electronic' }));
  });

  test('non-music goes by content type; no tags at all still gives something musical', () => {
    expect(['popcorn', 'eyes']).toContain(pickEmoji(song('iPhone review'), { type: 'video', genre: null }));
    expect(pickEmoji(song('E120 聊聊'), { type: 'podcast', genre: null })).toBe('thinking');
    expect(['notes', 'drum']).toContain(pickEmoji(song('Something'), null));
  });

  test('title words win over the genre', () => {
    expect(pickEmoji(song('Happy Birthday to You'), { type: 'music', genre: 'western-pop' })).toBe('cake');
    expect(pickEmoji(song('生日快乐歌'), { type: 'music', genre: 'cpop' })).toBe('cake');
    expect(pickEmoji(song('Rain on Me', 'Lady Gaga'), { type: 'music', genre: 'western-pop' })).toBe('rain');
    expect(pickEmoji(song('雨爱', '杨丞琳'), { type: 'music', genre: 'cpop' })).toBe('rain');
    expect(pickEmoji(song('Halloween party mix'), { type: 'music', genre: 'electronic' })).toBe('ghost');
    expect(pickEmoji(song('搞笑合集 第3期'), { type: 'video', genre: null })).toBe('joy');
    expect(pickEmoji(song('Love Story', 'Taylor Swift'), { type: 'music', genre: 'western-pop' })).toBe('heart');
  });

  test('words that only look like a keyword do not count', () => {
    // 鬼 is in 鬼滅の刃; "rainbow" must not be read as "rain"; "hot" alone means nothing.
    expect(pickEmoji(song('鬼滅の刃 紅蓮華', 'LiSA'), { type: 'music', genre: 'anime' })).not.toBe('ghost');
    expect(pickEmoji(song('Somewhere Over the Rainbow'), { type: 'music', genre: 'other' })).toBe('rainbow');
    expect(pickEmoji(song('Brain storm'), { type: 'music', genre: 'rock' })).not.toBe('rain');
  });

  test('the same song gets the same emoji every time (every tab picks on its own)', () => {
    const tags = { type: 'music', genre: 'rock' } as const;
    const first = pickEmoji(song('Numb', 'Linkin Park'), tags);
    for (let i = 0; i < 5; i++) expect(pickEmoji(song('Numb', 'Linkin Park'), tags)).toBe(first);
  });
});

describe('emoji sheets', () => {
  test('every emoji the bubble can show has a sprite sheet of the right size', () => {
    const names = Object.keys(EMOJI_SHEETS) as EmojiName[];
    expect(names.length).toBeGreaterThan(20);
    for (const name of [...names, ...Object.values(EVENT_EMOJI)]) {
      const sheet = EMOJI_SHEETS[name];
      // Tests run from the project root.
      const file = path.resolve('public/emoji', `${name}.webp`);
      expect(existsSync(file), name).toBe(true);
      // WebP "VP8X" header: canvas width/height minus one, 24-bit little-endian, at bytes 24 and 27.
      const b = readFileSync(file);
      expect(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12), name).toBe('RIFFWEBP');
      const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
      expect(w, name).toBe(EMOJI_CELL * EMOJI_COLS);
      expect(h, name).toBe(EMOJI_CELL * Math.ceil(sheet.frames / EMOJI_COLS));
      expect(sheet.poster).toBeLessThan(sheet.frames);
    }
  });
});

describe('kaomoji bubbles', () => {
  test('every mood has kaomoji, so any pick can be shown either way', () => {
    for (const name of Object.keys(EMOJI_SHEETS) as EmojiName[]) {
      expect(KAOMOJI[name].length, name).toBeGreaterThan(0);
      for (const k of KAOMOJI[name]) expect(k.length, name).toBeLessThanOrEqual(24);
    }
  });

  test('the style decides: emoji only, kaomoji only, or a stable mix of both', () => {
    expect(bubbleFor('guitar', 'emoji', 'seed')).toEqual({ kind: 'emoji', name: 'guitar' });
    const k = bubbleFor('guitar', 'kaomoji', 'seed');
    expect(k.kind).toBe('kaomoji');
    expect(KAOMOJI.guitar).toContain(k.kind === 'kaomoji' ? k.text : '');
    // Mixed: the same track always gets the same bubble; across tracks both kinds appear.
    expect(bubbleFor('coffee', 'mix', 'a song')).toEqual(bubbleFor('coffee', 'mix', 'a song'));
    const kinds = new Set(Array.from({ length: 40 }, (_, i) => bubbleFor('notes', 'mix', `song ${i}`).kind));
    expect(kinds).toEqual(new Set(['emoji', 'kaomoji']));
  });
});
