import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { en } from './en';
import { ja } from './ja';
import { zh, type MessageKey } from './zh';
import { getLang, initLang, localName, resolveLang, setLang, t, uiLang } from './core';

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('every language has every key, with the same placeholders', () => {
    for (const [name, dict] of Object.entries({ en, ja })) {
      for (const key of Object.keys(zh) as MessageKey[]) {
        expect(dict[key], `${name}.${key}`).toBeTruthy();
        expect(holes(dict[key]), `${name}.${key}`).toEqual(holes(zh[key]));
      }
      expect(Object.keys(dict).sort()).toEqual(Object.keys(zh).sort());
    }
  });

  it('English and Japanese have no Chinese-only leftovers', () => {
    // Simplified-only characters that never appear in Japanese text.
    const SIMPLIFIED = /[们这个么设删导图鉴识别锁换]/;
    for (const [key, s] of Object.entries(en)) expect(/[一-鿿]/.test(s), `en.${key}: ${s}`).toBe(false);
    for (const [key, s] of Object.entries(ja)) expect(SIMPLIFIED.test(s), `ja.${key}: ${s}`).toBe(false);
  });

  it('follows the browser language for "auto"', () => {
    expect(resolveLang('auto', ['ja-JP', 'en-US'])).toBe('ja');
    expect(resolveLang('auto', ['zh-TW'])).toBe('zh');
    expect(resolveLang('auto', ['fr-FR', 'en-GB'])).toBe('en');
    expect(resolveLang('auto', ['de-DE'])).toBe('en');
    expect(resolveLang('zh', ['en-US'])).toBe('zh');
  });

  it('fills placeholders', () => {
    expect(t('coll.drawn', { n: 3 }, 'en')).toBe('drawn 3×');
    expect(t('coll.drawn', { n: 3 }, 'zh')).toBe('抽到 3 次');
    expect(t('popup.showOn', { host: 'youtube.com' }, 'ja')).toBe('youtube.com でキャラを表示');
  });

  it('loads and follows the saved choice', async () => {
    fakeBrowser.reset();
    await uiLang.setValue('ja');
    await initLang();
    expect(getLang()).toBe('ja');
    await uiLang.setValue('en');
    await new Promise((r) => setTimeout(r, 0));
    expect(getLang()).toBe('en');
    setLang('zh');
  });

  it('uses per-language character names when a pack has them', () => {
    const p = { name: '莉娜 Rina', names: { en: 'Rina', ja: 'リナ', zh: '莉娜' } };
    expect(localName(p, 'ja')).toBe('リナ');
    expect(localName({ name: 'Mika' }, 'ja')).toBe('Mika');
  });
});
