import type { MediaInfo } from '../tagging/types';

/**
 * Direct character matching: when the title or artist names a known character,
 * work, meme or performer, show that character instead of drawing from a pool.
 *
 * This file is the pure rule matcher (no storage, no network). The rules live
 * in `table.ts`; downloading the matched character is `auto.ts`.
 */

/** `vtuber`: a virtual streamer, a character with a real person (and often a company) behind it. */
export type MatchKind = 'character' | 'vtuber' | 'meme' | 'person';

/** A string: that phrase appears. An array: every phrase in it appears. */
export type MatchKey = string | readonly string[];

export interface MatchRule {
  id: string;
  kind: MatchKind;
  /** What the rule is about, for people reading the table. */
  label: string;
  /** Looked for in "title artist". */
  keys: readonly MatchKey[];
  /** Looked for in the artist / channel name only: for names too short or too common to search titles for. */
  artist?: readonly string[];
  /**
   * Petdex slugs whose description was checked to depict this subject, most recognisable first:
   * the first one that is installed (or, failing that, still on Petdex) is the one shown.
   */
  petdex: readonly string[];
}

/** Same text → same key: width, case, zero-width characters and runs of spaces don't matter. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type Test = (text: string, squeezed: string) => boolean;

/**
 * A test for one phrase, given normalised text and the same text without spaces.
 * Latin phrases match whole words only; CJK phrases match anywhere.
 */
export function phraseTest(phrase: string): Test {
  const p = normalizeText(phrase);
  if (!p) return () => false;
  if (/^[\x20-\x7e]+$/.test(p)) {
    // Latin phrases must stand alone: "ado" must not match "avocado", "pepe" not "pepper".
    const re = new RegExp(`(?<![a-z0-9])${escapeRe(p)}(?![a-z0-9])`);
    return (text) => re.test(text);
  }
  // CJK and mixed phrases have no word boundaries, and titles space them freely.
  const q = p.replace(/ /g, '');
  return (_text, squeezed) => squeezed.includes(q);
}

function keyTest(key: MatchKey): Test {
  if (typeof key === 'string') return phraseTest(key);
  const all = key.map(phraseTest);
  return (text, squeezed) => all.length > 0 && all.every((t) => t(text, squeezed));
}

interface Compiled {
  rule: MatchRule;
  keys: Test[];
  artist: Test[];
}

export class RuleMatcher {
  private readonly compiled: Compiled[];

  constructor(rules: readonly MatchRule[]) {
    this.compiled = rules.map((rule) => ({
      rule,
      keys: rule.keys.map(keyTest),
      artist: (rule.artist ?? []).map(phraseTest),
    }));
  }

  /** The first rule (in table order) that this content names, or null. */
  find(info: Pick<MediaInfo, 'title' | 'artist'>): MatchRule | null {
    const artist = normalizeText(info.artist);
    const text = normalizeText(`${info.title} ${info.artist}`);
    const squeezed = text.replace(/ /g, '');
    const artistSqueezed = artist.replace(/ /g, '');
    for (const c of this.compiled) {
      if (c.keys.some((t) => t(text, squeezed)) || c.artist.some((t) => t(artist, artistSqueezed))) return c.rule;
    }
    return null;
  }
}

/** Problems that would make a table unusable; empty when it is fine. */
export function tableProblems(rules: readonly MatchRule[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) out.push(`duplicate rule id "${r.id}"`);
    seen.add(r.id);
    if (!r.keys.length && !r.artist?.length) out.push(`${r.id}: no keys`);
    if (!r.petdex.length) out.push(`${r.id}: no characters`);
    for (const k of [...r.keys.flat(), ...(r.artist ?? [])]) {
      const n = normalizeText(k);
      const latin = /^[\x20-\x7e]+$/.test(n);
      // One CJK character or two Latin letters match far too much.
      if (n.replace(/ /g, '').length < (latin ? 3 : 2)) out.push(`${r.id}: key "${k}" is too short`);
    }
    for (const s of r.petdex) if (!/^[a-z0-9][a-z0-9_-]*$/.test(s)) out.push(`${r.id}: "${s}" is not a Petdex slug`);
  }
  return out;
}
