import type { Lang } from '../i18n/core';
import type { Genre, LoadedPack } from '../pack/types';
import type { Tags } from '../tagging/types';
import data from './lines.json';

/**
 * Character lines (台词): a short sentence in the bubble that fits the character and
 * what is playing ("好舒服…" on lo-fi, "这首太燃了！！" on rock). Every line is written
 * in advance and reviewed (docs/characters/lines/, exported by scripts/lines2json.py);
 * nothing here is generated. An AI model can at most pick the mood (Tags.mood).
 * Spec: docs/characters/DIALOGUE.md.
 */

export const LINE_MOODS = ['calm', 'hype', 'bright', 'sad', 'any', 'ent', 'info', 'live', 'podcast'] as const;
export type LineMood = (typeof LINE_MOODS)[number];

/** Things a character can talk about. */
export type LineEvent =
  | 'appear'
  | 'click'
  | 'click.many'
  | 'playing'
  | 'paused'
  | 'resumed'
  | 'repeat'
  | 'long_play'
  | 'late_night'
  | 'idle';

/** How much the characters talk (setting). `quiet`: only when drawn again or tapped. */
export type TalkRate = 'chatty' | 'normal' | 'quiet' | 'off';

type Lines = Readonly<Record<string, readonly string[]>>;
interface LangLines {
  global: Lines;
  characters: Readonly<Record<string, Lines>>;
}
export const LINES = data as unknown as Readonly<Record<Lang, LangLines>>;

/** Each built-in character's signature kaomoji: what `{k}` in a line shows. */
export const SIGNATURE_KAOMOJI: Readonly<Record<string, string>> = {
  rina: '\\m/(≧▽≦)\\m/',
  hoshiri: '☆*:.｡.o(≧▽≦)o.｡.:*☆',
  qingge: '♪～(´ε｀ )',
  nei: '┏(＾0＾)┛┗(＾0＾)┓',
  mochi: '(っ˘ω˘ς )',
  popo: '(・ω・)つ🍿',
  kiki: '♪(´▽｀)',
  raku: '(⌐■_■)',
  viola: '(￣▽￣)♪～',
  aria: 'ヽ(＾Д＾)ﾉ',
  ouen: '(ﾉ´∀｀)ﾉ♪',
  tingting: '(・・？)',
  tsukishiro: '(_ _).｡o○ ☾',
  nova: '[ ^_^ ]♪',
  meimei: '(｀∀´)Ψ',
};

const GENRE_MOOD: Record<Genre, LineMood> = {
  lofi: 'calm',
  classical: 'calm',
  rock: 'hype',
  electronic: 'hype',
  hiphop: 'hype',
  jpop: 'bright',
  anime: 'bright',
  'western-pop': 'bright',
  // Ballads and dance tracks alike: only lines that suit both.
  cpop: 'any',
  other: 'any',
};

/**
 * Which group of `playing` lines fits, or null for none (the bubble shows an emoji).
 *
 * The AI's mood wins when there is one. Otherwise only a sure answer gets lines about
 * how the content feels: on 383 real titles, mood lines said from answers under the
 * model's hand-off confidence (0.9) were wrong about a third of the time, above it 2.7%.
 * A song we aren't sure of still gets the lines that fit any song; anything else we
 * aren't sure of (or know nothing about) gets none, since "any" lines talk about songs.
 */
export function moodOf(tags?: Pick<Tags, 'type' | 'genre' | 'vclass' | 'mood' | 'unsure'> | null): LineMood | null {
  if (!tags) return null;
  if (tags.type === 'music') {
    if (tags.mood) return tags.mood;
    return !tags.unsure && tags.genre ? GENRE_MOOD[tags.genre] : 'any';
  }
  if (tags.unsure) return null;
  switch (tags.type) {
    case 'video':
      return tags.vclass ?? null;
    case 'live':
      return 'live';
    case 'podcast':
      return 'podcast';
    default:
      return null;
  }
}

export type Speaker = Pick<LoadedPack, 'id' | 'source'>;

/**
 * Where a character's lines come from: its own, then the shared ones. Only built-in
 * characters talk: imported and Petdex characters have personalities of their own
 * that our lines would get wrong, so they keep to emoji and kaomoji.
 */
export function sourcesFor(speaker: Speaker, lang: Lang): Lines[] {
  if (speaker.source !== 'builtin') return [];
  const book = LINES[lang];
  const own = book.characters[speaker.id];
  return own ? [own, book.global] : [book.global];
}

/** The keys to look for, best first (in each source in turn). */
export function keysFor(event: LineEvent, mood: LineMood = 'any'): string[] {
  if (event === 'playing') return mood === 'any' ? ['playing.any'] : [`playing.${mood}`, 'playing.any'];
  if (event === 'click.many') return ['click.many', 'click'];
  return [event];
}

/** Lines tied to what plays (not to something the user just did): these wait for the cooldown. */
const AMBIENT: ReadonlySet<LineEvent> = new Set(['playing', 'paused', 'resumed', 'repeat', 'long_play', 'late_night', 'idle']);

/** Least time between two ambient lines. */
export const TALK_GAP_MS: Record<'chatty' | 'normal', number> = { chatty: 60_000, normal: 3 * 60_000 };

/** How many lines a long play needs before a "you've been at it a while" line. */
export const LONG_PLAY_MS = 60 * 60_000;
/** A resume after a pause shorter than this is not worth a "welcome back". */
export const RESUME_AFTER_MS = 30_000;
/** Nothing has played for this long while the character is on screen ("一直显示"): an idle line… */
export const IDLE_AFTER_MS = 10 * 60_000;
/** …and another one this often while it stays quiet. */
export const IDLE_EVERY_MS = 30 * 60_000;
/** Clicks within this window make a "stop poking me" line. */
export const CLICK_WINDOW_MS = 5_000;
export const MANY_CLICKS = 3;

/** 0–4 am local time: characters say something about the hour instead. */
export function isLateNight(d: Date): boolean {
  return d.getHours() < 4;
}

type Position = { currentTime: number; duration: number };

/**
 * The track started over: it was near its end and is back near its start (the player
 * loops it, or it was played again). Short clips and unknown lengths don't count.
 */
export function isReplay(before: Position | null, now: Position): boolean {
  if (!before) return false;
  const d = now.duration || before.duration;
  if (!(d >= 20)) return false;
  return before.currentTime >= Math.max(d - 8, d * 0.85) && now.currentTime <= 5;
}

/** How long a line stays up: long enough to read, never long enough to be in the way. */
export function lineMs(text: string): number {
  return Math.min(5000, Math.max(2500, 1500 + [...text].length * 120));
}

/**
 * One per bubble view: picks lines, avoids repeating the last few of each group, and
 * keeps the cooldown between ambient lines. `rng` returns [0, 1).
 */
export class Talker {
  private readonly recent = new Map<string, string[]>();
  private lastAmbient = -Infinity;
  private lateNightOn = '';
  private clicks: number[] = [];

  constructor(
    private readonly rng: () => number = Math.random,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** May an `event` line be said now at this `rate`? */
  allowed(event: LineEvent, rate: TalkRate): boolean {
    if (rate === 'off') return false;
    if (!AMBIENT.has(event)) return true;
    if (rate === 'quiet') return false;
    return this.now() - this.lastAmbient >= TALK_GAP_MS[rate];
  }

  /**
   * A line for `event`, or null (not allowed now, a character that doesn't talk, no
   * such line). Saying an ambient line starts the cooldown.
   */
  say(event: LineEvent, opts: { speaker: Speaker; lang: Lang; rate: TalkRate; mood?: LineMood }): string | null {
    if (!this.allowed(event, opts.rate)) return null;
    const line = this.pick(event, opts.speaker, opts.lang, opts.mood);
    if (line !== null && AMBIENT.has(event)) this.lastAmbient = this.now();
    return line;
  }

  /** The first `playing` line of the night is about the hour (once per night). */
  lateNightDue(): boolean {
    const d = new Date(this.now());
    if (!isLateNight(d)) return false;
    const night = d.toDateString();
    if (this.lateNightOn === night) return false;
    this.lateNightOn = night;
    return true;
  }

  /** Count a tap: 'click' or, after a few quick ones, 'click.many'. */
  tap(): 'click' | 'click.many' {
    const t = this.now();
    this.clicks = [...this.clicks.filter((c) => t - c < CLICK_WINDOW_MS), t];
    return this.clicks.length >= MANY_CLICKS ? 'click.many' : 'click';
  }

  private pick(event: LineEvent, speaker: Speaker, lang: Lang, mood?: LineMood): string | null {
    for (const src of sourcesFor(speaker, lang)) {
      for (const key of keysFor(event, mood)) {
        const pool = src[key];
        if (!pool?.length) continue;
        const memo = `${speaker.id}|${lang}|${key}`;
        const seen = this.recent.get(memo) ?? [];
        const fresh = pool.filter((l) => !seen.includes(l));
        const options = fresh.length ? fresh : pool;
        const line = options[Math.floor(this.rng() * options.length)]!;
        this.recent.set(memo, [line, ...seen].slice(0, Math.min(3, pool.length - 1)));
        return fill(line, speaker.id);
      }
    }
    return null;
  }
}

/** `{k}` → the character's kaomoji (nothing for a character without one). */
export function fill(line: string, id: string): string {
  return line.replaceAll('{k}', SIGNATURE_KAOMOJI[id] ?? '').replace(/\s+/g, ' ').trim();
}
