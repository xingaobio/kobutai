<script lang="ts">
  import { LANGS, LANG_NAMES, uiLang, type Lang } from '@/lib/i18n/core';
  import { i18n, t } from '@/lib/i18n/ui.svelte';

  /** Short labels for the compact switch; the full names are in Settings. */
  const SHORT: Record<Lang, string> = { en: 'EN', ja: '日本語', zh: '中文' };
</script>

<div class="langs" role="group" aria-label={t('lang.label')} data-testid="lang-switch">
  {#each LANGS as l (l)}
    <button
      type="button"
      lang={l === 'zh' ? 'zh-CN' : l}
      aria-pressed={i18n.lang === l}
      title={LANG_NAMES[l]}
      onclick={() => uiLang.setValue(l)}
      data-lang={l}>{SHORT[l]}</button
    >
  {/each}
</div>

<style>
  .langs {
    display: inline-flex;
    background: var(--card);
    border-radius: 999px;
    padding: 3px;
  }
  button {
    border: 0;
    background: none;
    color: var(--muted);
    font: 600 12px/1 var(--font-body, system-ui);
    padding: 7px 10px;
    border-radius: 999px;
    cursor: pointer;
  }
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--card);
  }
</style>
