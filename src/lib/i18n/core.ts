import { storage } from '#imports';
import { en } from './en';
import { ja } from './ja';
import { zh, type MessageKey } from './zh';

/**
 * Interface languages. Chinese is the source; English and Japanese must translate
 * every key (their dictionaries are typed against zh, so a missing key fails typecheck).
 */
export const LANGS = ['en', 'ja', 'zh'] as const;
export type Lang = (typeof LANGS)[number];
/** What the user picked in settings; "auto" follows the browser's language. */
export type LangPref = 'auto' | Lang;

export const LANG_NAMES: Record<Lang, string> = { en: 'English', ja: '日本語', zh: '中文' };

const DICTS: Record<Lang, Record<MessageKey, string>> = { zh, en, ja };

/** Saved per browser (not synced): someone may want English at work and Chinese at home. */
export const uiLang = storage.defineItem<LangPref>('local:uiLang', { fallback: 'auto' });

/** First browser language we speak; English otherwise. */
export function resolveLang(pref: LangPref, languages: readonly string[] = browserLanguages()): Lang {
  if (pref !== 'auto') return pref;
  for (const l of languages) {
    const x = l.toLowerCase();
    if (x.startsWith('zh')) return 'zh';
    if (x.startsWith('ja')) return 'ja';
    if (x.startsWith('en')) return 'en';
  }
  return 'en';
}

function browserLanguages(): readonly string[] {
  const nav = globalThis.navigator;
  if (!nav) return [];
  return nav.languages?.length ? nav.languages : nav.language ? [nav.language] : [];
}

let current: Lang = resolveLang('auto');
const listeners = new Set<(l: Lang) => void>();

export const getLang = (): Lang => current;

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  for (const cb of listeners) cb(l);
}

export function onLang(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export type Params = Record<string, string | number>;

/** Look up a message and fill in its {placeholders}. */
export function t(key: MessageKey, params?: Params, lang: Lang = current): string {
  const s = DICTS[lang][key] ?? zh[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

let started: Promise<Lang> | null = null;
/** Load the saved choice and follow later changes. Safe to call more than once. */
export function initLang(): Promise<Lang> {
  started ??= (async () => {
    try {
      setLang(resolveLang(await uiLang.getValue()));
      uiLang.watch((p) => setLang(resolveLang(p ?? 'auto')));
    } catch {
      // Storage unavailable (e.g. extension context invalidated): keep the browser language.
    }
    return current;
  })();
  return started;
}

/** The character's name in the interface language, when its pack provides one. */
export function localName(p: { name: string; names?: Partial<Record<Lang, string>> }, lang: Lang = current): string {
  return p.names?.[lang]?.trim() || p.name;
}

export type { MessageKey };
