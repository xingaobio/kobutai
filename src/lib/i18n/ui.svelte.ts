import * as core from './core';
import type { Lang, MessageKey, Params } from './core';

/**
 * Reactive language for Svelte components: reading `i18n.lang` (which `t` does)
 * makes a template update when the language changes.
 */
export const i18n = $state<{ lang: Lang }>({ lang: core.getLang() });
core.onLang((l) => (i18n.lang = l));
void core.initLang();

export function t(key: MessageKey, params?: Params): string {
  return core.t(key, params, i18n.lang);
}

export function localName(p: { name: string; names?: Partial<Record<Lang, string>> }): string {
  return core.localName(p, i18n.lang);
}

/** `<html lang>` follows the interface language (fonts, line breaking, screen readers). */
export function syncDocumentLang(): void {
  $effect.root(() => {
    $effect(() => {
      document.documentElement.lang = i18n.lang === 'zh' ? 'zh-CN' : i18n.lang;
    });
  });
}

/** BCP 47 locale for dates and numbers. */
export function locale(): string {
  return i18n.lang === 'zh' ? 'zh-CN' : i18n.lang;
}
