import { describe, expect, test } from 'vitest';
import { LANGS } from '../i18n/core';
import {
  LINES,
  LINE_MOODS,
  SIGNATURE_KAOMOJI,
  TALK_GAP_MS,
  Talker,
  fill,
  isLateNight,
  keysFor,
  lineMs,
  moodOf,
  sourcesFor,
} from './dialogue';

/** Same width rule as scripts/lines2json.py: full-width counts 1, the rest 0.5. */
function width(text: string): number {
  let w = 0;
  for (const ch of text.replaceAll('{k}', '')) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦…—‘-”★☆♪　-〿]/.test(ch) || ch.codePointAt(0)! > 0xffff ? 1 : 0.5;
  return w;
}
const MAX_WIDTH = { zh: 16, ja: 18, en: 20 } as const;
const KEYS = new Set([
  'appear',
  'click',
  'click.many',
  'paused',
  'resumed',
  'repeat',
  'long_play',
  'late_night',
  'idle',
  ...LINE_MOODS.map((m) => `playing.${m}`),
]);

describe('the line library (docs/characters/lines → lines.json)', () => {
  test('every language has the same characters, so switching language never silences one', () => {
    const ids = LANGS.map((l) => Object.keys(LINES[l].characters).sort());
    expect(ids[0]!.length).toBeGreaterThanOrEqual(7);
    for (const other of ids.slice(1)) expect(other).toEqual(ids[0]);
  });

  test.each(LANGS)('%s: known keys, required ones present, short enough, only {k} as a placeholder', (lang) => {
    const book = LINES[lang];
    for (const [id, lines] of [['_global', book.global] as const, ...Object.entries(book.characters)]) {
      for (const req of ['appear', 'click', 'playing.any', 'paused']) expect(lines[req]?.length, `${lang}/${id}/${req}`).toBeGreaterThan(0);
      for (const [key, pool] of Object.entries(lines)) {
        expect(KEYS.has(key), `${lang}/${id}: unknown key ${key}`).toBe(true);
        for (const line of pool) {
          expect(width(line), `${lang}/${id}/${key}: ${line}`).toBeLessThanOrEqual(MAX_WIDTH[lang]);
          expect(line.replaceAll('{k}', ''), `${lang}/${id}/${key}: ${line}`).not.toMatch(/[{}]/);
          if (line.includes('{k}')) expect(SIGNATURE_KAOMOJI[id], `${id} has no kaomoji for {k}`).toBeTruthy();
        }
      }
    }
  });
});

describe('moodOf', () => {
  test('genre decides for music, unless the AI gave a mood', () => {
    expect(moodOf({ type: 'music', genre: 'lofi' })).toBe('calm');
    expect(moodOf({ type: 'music', genre: 'rock' })).toBe('hype');
    expect(moodOf({ type: 'music', genre: 'anime' })).toBe('bright');
    // Mandarin pop is ballads and dance tracks alike.
    expect(moodOf({ type: 'music', genre: 'cpop' })).toBe('any');
    expect(moodOf({ type: 'music', genre: 'cpop', mood: 'sad' })).toBe('sad');
    // The classifier wasn't sure: only lines that fit anything.
    expect(moodOf({ type: 'music', genre: null })).toBe('any');
  });

  test('videos, live streams and podcasts', () => {
    expect(moodOf({ type: 'video', genre: null, vclass: 'info' })).toBe('info');
    expect(moodOf({ type: 'video', genre: null })).toBe('any');
    expect(moodOf({ type: 'live', genre: null })).toBe('live');
    expect(moodOf({ type: 'podcast', genre: null })).toBe('podcast');
    expect(moodOf(null)).toBe('any');
  });
});

describe('who talks', () => {
  test('built-in characters with lines: their own, then the shared ones', () => {
    const [own, shared] = sourcesFor({ id: 'rina', source: 'builtin' }, 'zh');
    expect(own).toBe(LINES.zh.characters.rina);
    expect(shared).toBe(LINES.zh.global);
  });

  test('a built-in character without its own lines yet uses the shared ones', () => {
    expect(sourcesFor({ id: 'not-written-yet', source: 'builtin' }, 'en')).toEqual([LINES.en.global]);
  });

  test('imported and Petdex characters keep to emoji: their personality is not ours to write', () => {
    for (const source of ['petdex', 'remote', 'user'] as const) expect(sourcesFor({ id: 'rina', source }, 'zh')).toEqual([]);
    expect(new Talker().say('click', { speaker: { id: 'rina', source: 'petdex' }, lang: 'zh', rate: 'chatty' })).toBeNull();
  });

  test('keys fall back from the mood to lines that fit anything', () => {
    expect(keysFor('playing', 'calm')).toEqual(['playing.calm', 'playing.any']);
    expect(keysFor('playing')).toEqual(['playing.any']);
    expect(keysFor('click.many')).toEqual(['click.many', 'click']);
    expect(keysFor('paused')).toEqual(['paused']);
  });
});

describe('Talker', () => {
  const rina = { id: 'rina', source: 'builtin' } as const;
  const clock = (t0 = 0) => {
    const c = { t: t0, now: () => c.t };
    return c;
  };

  test('a line from the right group, in the right language', () => {
    const t = new Talker(() => 0, () => 0);
    expect(LINES.zh.characters.rina!['playing.hype']).toContain(t.say('playing', { speaker: rina, lang: 'zh', rate: 'normal', mood: 'hype' }));
    const ja = new Talker(() => 0, () => 0);
    expect(LINES.ja.characters.rina!['playing.hype']!.map((l) => fill(l, 'rina'))).toContain(
      ja.say('playing', { speaker: rina, lang: 'ja', rate: 'normal', mood: 'hype' }),
    );
  });

  test('ambient lines wait for the cooldown; taps never do', () => {
    const c = clock();
    const t = new Talker(Math.random, c.now);
    const opts = { speaker: rina, lang: 'en', rate: 'normal' } as const;
    expect(t.say('playing', opts)).not.toBeNull();
    c.t += TALK_GAP_MS.normal - 1;
    expect(t.say('paused', opts)).toBeNull();
    expect(t.say('click', opts)).not.toBeNull();
    c.t += 1;
    expect(t.say('paused', opts)).not.toBeNull();
    // Chatty: a shorter wait.
    c.t += TALK_GAP_MS.chatty;
    expect(t.say('playing', { ...opts, rate: 'chatty' })).not.toBeNull();
  });

  test('quiet: only taps and new characters; off: nothing', () => {
    const t = new Talker();
    const quiet = { speaker: rina, lang: 'zh', rate: 'quiet' } as const;
    expect(t.say('playing', quiet)).toBeNull();
    expect(t.say('appear', quiet)).not.toBeNull();
    expect(t.say('click', quiet)).not.toBeNull();
    for (const ev of ['appear', 'click', 'playing'] as const) expect(t.say(ev, { ...quiet, rate: 'off' })).toBeNull();
  });

  test('never repeats one of the last few lines of a group', () => {
    const t = new Talker();
    const pool = LINES.zh.characters.rina!.click!;
    const said: string[] = [];
    for (let i = 0; i < 40; i++) said.push(t.say('click', { speaker: rina, lang: 'zh', rate: 'normal' })!);
    const keep = Math.min(3, pool.length - 1);
    for (let i = 1; i < said.length; i++) expect(said.slice(Math.max(0, i - keep), i)).not.toContain(said[i]);
  });

  test('a few quick taps: "stop poking me"', () => {
    const c = clock();
    const t = new Talker(Math.random, c.now);
    expect(t.tap()).toBe('click');
    c.t += 1000;
    expect(t.tap()).toBe('click');
    c.t += 1000;
    expect(t.tap()).toBe('click.many');
    c.t += 10_000;
    expect(t.tap()).toBe('click');
  });

  test('the late-night line comes once a night, only between 0 and 4 am', () => {
    const at = (h: number, day = 22) => new Date(2026, 9, day, h, 30).getTime();
    const c = clock(at(23));
    const t = new Talker(Math.random, c.now);
    expect(t.lateNightDue()).toBe(false);
    c.t = at(1, 23);
    expect(t.lateNightDue()).toBe(true);
    c.t = at(2, 23);
    expect(t.lateNightDue()).toBe(false);
    c.t = at(1, 24);
    expect(t.lateNightDue()).toBe(true);
    expect(isLateNight(new Date(at(4)))).toBe(false);
  });
});

test('{k} becomes the character\'s kaomoji', () => {
  expect(fill('吓我一跳！{k}', 'rina')).toBe('吓我一跳！\\m/(≧▽≦)\\m/');
  expect(fill('{k} hi', 'nobody')).toBe('hi');
});

test('a line stays up long enough to read, never in the way', () => {
  expect(lineMs('嗯。')).toBe(2500);
  expect(lineMs('x'.repeat(60))).toBe(5000);
});
