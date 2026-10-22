<script lang="ts">
  import type { LoadedPack } from '@/lib/pack/types';
  import { syncAllLibraries } from '@/lib/librarySync';
  import { DEFAULT_LIBRARY } from '@/lib/remote';
  import { bubbleStyle, emojiBubbles, encoreRate, libraries, lockedPack, remoteSync, setSiteHidden, showWhen, talkRate, type RemoteSyncStatus } from '@/lib/settings';
  import { TALK_GAP_MS, type TalkRate } from '@/lib/dialogue/dialogue';
  import { IDLE_GRACE_MS, type ShowWhen } from '@/lib/ui/presence';
  import { ENCORE_GAP_MS, type EncoreRate } from '@/lib/emoji/encore';
  import type { BubbleStyle } from '@/lib/emoji/kaomoji';
  import { LANGS, LANG_NAMES, uiLang, type LangPref } from '@/lib/i18n/core';
  import { locale, localName, t } from '@/lib/i18n/ui.svelte';

  let { hidden, locked, packs }: { hidden: string[]; locked: string | null; packs: LoadedPack[] } = $props();

  const lockedPackObj = $derived(packs.find((p) => p.id === locked));
  const lockedName = $derived(lockedPackObj ? localName(lockedPackObj) : locked);

  // --- Interface language ---
  let langPref = $state<LangPref>('auto');
  void uiLang.getValue().then((v) => (langPref = v));
  uiLang.watch((v) => (langPref = v ?? 'auto'));

  // --- When the character shows ---
  let when = $state<ShowWhen>('playing');
  void showWhen.getValue().then((v) => (when = v));
  showWhen.watch((v) => (when = v));

  // --- Emoji bubble ---
  let bubbles = $state(true);
  void emojiBubbles.getValue().then((v) => (bubbles = v));
  emojiBubbles.watch((v) => (bubbles = v));
  let style = $state<BubbleStyle>('mix');
  void bubbleStyle.getValue().then((v) => (style = v));
  bubbleStyle.watch((v) => (style = v));
  const STYLES: BubbleStyle[] = ['mix', 'emoji', 'kaomoji'];
  // --- Encores in a long play ---
  let encore = $state<EncoreRate>('often');
  void encoreRate.getValue().then((v) => (encore = v));
  encoreRate.watch((v) => (encore = v));
  const minutes = (rate: 'often' | 'sometimes') => ENCORE_GAP_MS[rate].map((ms) => ms / 60_000).join('–');
  const ENCORES: EncoreRate[] = ['often', 'sometimes', 'off'];
  const encoreText = (r: EncoreRate) => (r === 'off' ? t('set.encore.off') : t(`set.encore.${r}`, { m: minutes(r) }));
  // --- Character lines ---
  let talk = $state<TalkRate>('normal');
  void talkRate.getValue().then((v) => (talk = v));
  talkRate.watch((v) => (talk = v));
  const TALKS: TalkRate[] = ['chatty', 'normal', 'quiet', 'off'];
  const talkText = (r: TalkRate) => (r === 'chatty' || r === 'normal' ? t(`set.talk.${r}`, { m: TALK_GAP_MS[r] / 60_000 }) : t(`set.talk.${r}`));


  // --- Remote libraries ---
  let libs = $state<string[]>([]);
  let status = $state<RemoteSyncStatus | null>(null);
  let newLib = $state('');
  let libError = $state<string | null>(null);
  let syncing = $state(false);
  void libraries.getValue().then((v) => (libs = v));
  libraries.watch((v) => (libs = v));
  void remoteSync.getValue().then((v) => (status = v));
  remoteSync.watch((v) => (status = v));
  const remoteCount = $derived(packs.filter((p) => p.source === 'remote').length);

  async function addLibrary() {
    libError = null;
    let url: URL;
    try {
      url = new URL(newLib.trim());
    } catch {
      libError = t('common.invalidUrl');
      return;
    }
    if (url.protocol !== 'https:') {
      libError = t('set.lib.httpsOnly');
      return;
    }
    // Hosts without CORS headers need host access; ask only for that origin.
    if (url.host !== 'raw.githubusercontent.com') {
      await browser.permissions.request({ origins: [`${url.origin}/*`] }).catch(() => false);
    }
    await libraries.setValue([...new Set([...libs, url.href])]);
    newLib = '';
    await syncNow();
  }

  async function syncNow() {
    syncing = true;
    try {
      status = await syncAllLibraries();
    } finally {
      syncing = false;
    }
  }
</script>

<section>
  <div class="intro">
    <h1 class="display">{t('set.title')}</h1>
    <p class="hint">{t('set.intro')}</p>
  </div>

  <div class="cols">
    <div class="card">
      <h2 class="display">{t('set.lang.title')}</h2>
      <label class="check">
        <input type="radio" name="ui-lang" checked={langPref === 'auto'} onchange={() => uiLang.setValue('auto')} data-testid="lang-auto" />
        {t('set.lang.auto')}
      </label>
      {#each LANGS as l (l)}
        <label class="check">
          <input type="radio" name="ui-lang" checked={langPref === l} onchange={() => uiLang.setValue(l)} data-testid="lang-{l}" />
          <span lang={l === 'zh' ? 'zh-CN' : l}>{LANG_NAMES[l]}</span>
        </label>
      {/each}
      <p class="hint small">{t('set.lang.hint')}</p>
    </div>

    <div class="card">
      <h2 class="display">{t('set.when.title')}</h2>
      <label class="check">
        <input type="radio" name="show-when" checked={when === 'playing'} onchange={() => showWhen.setValue('playing')} data-testid="show-when-playing" />
        {t('set.when.playing')}
      </label>
      <label class="check">
        <input type="radio" name="show-when" checked={when === 'always'} onchange={() => showWhen.setValue('always')} data-testid="show-when-always" />
        {t('set.when.always')}
      </label>
      <p class="hint small">{t('set.when.hint', { m: IDLE_GRACE_MS / 60_000 })}</p>
    </div>

    <div class="card">
      <h2 class="display">{t('set.bubble.title')}</h2>
      <label class="check">
        <input type="checkbox" checked={bubbles} onchange={(e) => emojiBubbles.setValue(e.currentTarget.checked)} data-testid="emoji-bubbles" />
        {t('set.bubble.on')}
      </label>
      {#each STYLES as value (value)}
        <label class="check indent">
          <input type="radio" name="bubble-style" checked={style === value} disabled={!bubbles} onchange={() => bubbleStyle.setValue(value)} data-testid="bubble-style-{value}" />
          {t(`set.bubble.${value}`)}
        </label>
      {/each}
      <p class="sub">{t('set.talk.title')}</p>
      {#each TALKS as value (value)}
        <label class="check indent">
          <input type="radio" name="talk-rate" checked={talk === value} disabled={!bubbles} onchange={() => talkRate.setValue(value)} data-testid="talk-{value}" />
          {talkText(value)}
        </label>
      {/each}
      <p class="hint small">{t('set.talk.hint')}</p>
      <p class="sub">{t('set.encore.title')}</p>
      {#each ENCORES as value (value)}
        <label class="check indent">
          <input type="radio" name="encore-rate" checked={encore === value} onchange={() => encoreRate.setValue(value)} data-testid="encore-{value}" />
          {encoreText(value)}
        </label>
      {/each}
      <p class="hint small">
        {t('set.encore.hint')}
        <a href="https://github.com/googlefonts/noto-emoji" target="_blank" rel="noreferrer">Google Noto Emoji</a>{t('set.encore.open')}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>{t('set.encore.close')}
      </p>
    </div>

    <div class="card">
      <h2 class="display">{t('set.lock.title')}</h2>
      {#if locked}
        <div class="row-line">
          <span>{t('set.lock.current')}<b>{lockedName}</b>{t('set.lock.currentEnd')}</span>
          <button class="btn small" onclick={() => lockedPack.setValue(null)}>{t('set.lock.unlock')}</button>
        </div>
      {:else}
        <p class="hint small">{t('set.lock.none')}</p>
      {/if}

      <h2 class="display second">{t('set.hidden.title')}</h2>
      {#if hidden.length}
        <ul>
          {#each hidden as host (host)}
            <li><span class="url">{host}</span><button class="btn small" onclick={() => setSiteHidden(host, false)}>{t('set.hidden.show')}</button></li>
          {/each}
        </ul>
      {:else}
        <p class="hint small">{t('set.hidden.none')}</p>
      {/if}
    </div>

    <div class="card">
      <h2 class="display">{t('set.lib.title')}</h2>
      <p class="hint small">
        {t('set.lib.hint')} {t('set.lib.count')}<b data-testid="remote-count">{remoteCount}</b>{t('set.lib.countEnd')}
      </p>
      <ul>
        {#each libs as url (url)}
          <li data-testid="library">
            <span class="url">{url}{url === DEFAULT_LIBRARY ? t('set.lib.default') : ''}</span>
            <button
              class="btn small soft"
              onclick={async () => {
                await libraries.setValue(libs.filter((u) => u !== url));
                await syncNow();
              }}>{t('common.remove')}</button
            >
          </li>
        {/each}
      </ul>
      <form
        class="inline"
        onsubmit={(e) => {
          e.preventDefault();
          void addLibrary();
        }}
      >
        <input class="text" type="url" placeholder="https://…/index.json" bind:value={newLib} aria-label={t('set.lib.urlAria')} required />
        <button class="btn" type="submit">{t('common.add')}</button>
        <button class="btn" type="button" onclick={syncNow} disabled={syncing} data-testid="sync-now">{syncing ? t('set.lib.syncing') : t('set.lib.sync')}</button>
      </form>
      {#if libError}<p class="err">{libError}</p>{/if}
      {#if status}
        <p class="hint small" data-testid="sync-status">
          {t('set.lib.last', { at: new Date(status.at).toLocaleString(locale()), result: status.ok ? t('set.lib.ok') : t('set.lib.failed'), n: status.count })}
        </p>
        {#if status.errors.length}
          <details class="small"><summary>{t('set.lib.problems', { n: status.errors.length })}</summary><ul class="errors">{#each status.errors as e}<li>{e}</li>{/each}</ul></details>
        {/if}
      {/if}
    </div>
  </div>
</section>

<style>
  .intro {
    max-width: 680px;
  }
  h1 {
    margin: 0;
    font-size: 44px;
    line-height: 1.1;
  }
  .intro p {
    margin: 4px 0 0;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  h2.second {
    margin-top: 18px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
    gap: 20px;
    align-items: start;
    margin-top: 24px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .card p {
    margin: 4px 0 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 2px 0;
  }
  .check input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
    margin: 0;
  }
  .indent {
    padding-left: 24px;
  }
  .sub {
    margin-top: 10px !important;
  }
  .small {
    font-size: 12px;
  }
  .row-line {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--paper);
  }
  ul.errors li {
    display: list-item;
    background: none;
    padding: 2px 0;
    color: var(--muted);
  }
  .url {
    word-break: break-all;
  }
  form.inline {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  form.inline input {
    flex: 1;
    min-width: 200px;
  }
  .err {
    color: var(--danger);
  }
</style>
