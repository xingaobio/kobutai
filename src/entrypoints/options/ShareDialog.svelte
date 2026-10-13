<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Preview from '@/components/Preview.svelte';
  import { blobKey, getBlob, isBlobRef } from '@/lib/blobstore';
  import { localName, t } from '@/lib/i18n/ui.svelte';
  import { GENRES, type Genre, type LoadedPack, type PackManifest } from '@/lib/pack/types';
  import { SHARE_LICENSE_URL, SUBMIT_EMAIL, buildSubmission, githubIssueUrl, mailtoUrl } from '@/lib/share/submit';
  import { shareAuthor } from '@/lib/settings';
  import { genreLabel } from '@/lib/ui/labels';

  let { pack, onclose }: { pack: LoadedPack; onclose: () => void } = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(localName(pack));
  let author = $state('');
  let genres = $state<Genre[]>([]);
  let agreed = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let done = $state<{ manifest: PackManifest; filename: string } | null>(null);
  void shareAuthor.getValue().then((v) => (author ||= v));

  const PICKABLE = GENRES.filter((g) => g !== 'other');
  const ready = $derived(!!name.trim() && !!author.trim() && agreed && !busy);

  function toggle(g: Genre, on: boolean) {
    genres = on ? [...genres, g] : genres.filter((x) => x !== g);
  }

  async function make() {
    error = null;
    busy = true;
    try {
      const src = pack.states.idle.src;
      const sheet = isBlobRef(src) ? await getBlob(blobKey(src)) : await fetch(src).then((r) => r.blob());
      if (!sheet) throw new Error(t('share.err.noSheet'));
      const r = await buildSubmission(pack, { name, author, genres: $state.snapshot(genres) }, sheet);
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      await shareAuthor.setValue(author.trim());
      done = { manifest: r.manifest, filename: r.filename };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const open = (url: string) => void browser.tabs.create({ url });
</script>

<div class="backdrop">
  <div class="dialog card" role="dialog" aria-modal="true" aria-labelledby="share-title" data-testid="share-dialog">
    <div class="top">
      <div class="thumb"><Preview {pack} scale={0.36} /></div>
      <div>
        <h2 class="display" id="share-title">{t('share.title')}</h2>
        <p class="hint small">{t('share.intro')}</p>
      </div>
    </div>

    {#if !done}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          if (ready) void make();
        }}
      >
        <label class="field">{t('share.name')}<input type="text" bind:value={name} maxlength="40" required data-testid="share-name" /></label>
        <label class="field">
          {t('share.author')}
          <input type="text" bind:value={author} maxlength="60" placeholder={t('share.authorPh')} required data-testid="share-author" />
        </label>
        <fieldset>
          <legend>{t('share.genres')}</legend>
          <div class="genres">
            {#each PICKABLE as g (g)}
              <label class="chip" class:on={genres.includes(g)}>
                <input type="checkbox" checked={genres.includes(g)} onchange={(e) => toggle(g, e.currentTarget.checked)} />
                {genreLabel(g)}
              </label>
            {/each}
          </div>
          <p class="hint small">{t('share.genresHint')}</p>
        </fieldset>
        <label class="consent">
          <input type="checkbox" bind:checked={agreed} data-testid="share-consent" />
          <span>
            {t('share.consent')}
            <a href={SHARE_LICENSE_URL} target="_blank" rel="noreferrer">{t('share.licenseLink')}</a>
          </span>
        </label>
        {#if error}<p class="err">{error}</p>{/if}
        <div class="actions">
          <button class="btn" type="button" onclick={onclose}>{t('common.cancel')}</button>
          <button class="btn solid" type="submit" disabled={!ready} data-testid="share-make">
            <Icon name="download" size={15} />{busy ? t('share.making') : t('share.make')}
          </button>
        </div>
      </form>
    {:else}
      {@const d = done}
      <div class="ok" data-testid="share-done">
        <Icon name="check" size={16} stroke={2.6} />
        <span>{t('share.saved', { file: d.filename })}</span>
      </div>
      <p class="small">{t('share.next')}</p>
      <div class="ways">
        <button class="way" type="button" onclick={() => open(githubIssueUrl(d.manifest, d.filename))} data-testid="share-github">
          <b>{t('share.github')}</b>
          <span class="hint small">{t('share.githubHint')}</span>
        </button>
        {#if SUBMIT_EMAIL}
          {@const mail = mailtoUrl(d.manifest, d.filename)}
          <a class="way" href={mail} data-testid="share-email">
            <b>{t('share.email')}</b>
            <span class="hint small">{t('share.emailHint', { email: SUBMIT_EMAIL })}</span>
          </a>
        {/if}
      </div>
      <p class="hint small">{t('share.after')}</p>
      <div class="actions"><button class="btn" type="button" onclick={onclose}>{t('common.close')}</button></div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(58 39 72 / 0.35);
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 10;
  }
  .dialog {
    width: min(520px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .top {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .top p {
    margin: 4px 0 0;
  }
  h2 {
    margin: 0;
    font-size: 24px;
  }
  .thumb {
    width: 76px;
    height: 84px;
    border-radius: 14px;
    background: var(--pink-soft);
    display: grid;
    place-items: end center;
    overflow: hidden;
    flex: none;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  legend {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 6px;
  }
  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--chip);
    font-size: 12px;
    cursor: pointer;
  }
  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .chip:focus-within {
    outline: 2px solid var(--accent);
  }
  .chip.on {
    background: var(--ink);
    color: var(--card);
  }
  .consent {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--paper);
    font-size: 13px;
    cursor: pointer;
  }
  .consent input {
    margin-top: 3px;
    accent-color: var(--accent);
    flex: none;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .ok {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--ok-bg);
    color: var(--ok);
    font-weight: 600;
    word-break: break-all;
  }
  .ways {
    display: grid;
    gap: 8px;
  }
  .way {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 2px dashed var(--dash);
    background: var(--card);
    color: var(--ink);
  }
  .way:hover,
  .way:focus-visible {
    border-color: var(--accent);
  }
  .small {
    font-size: 12px;
  }
  p {
    margin: 0;
  }
  .err {
    color: var(--danger);
  }
</style>
