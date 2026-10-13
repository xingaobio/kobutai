<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Preview from '@/components/Preview.svelte';
  import { fetchPetdexManifest, importFromFiles, importFromPetdex, removeFromCollection } from '@/lib/importer';
  import { MAX_AUTO_PACKS } from '@/lib/match/auto';
  import { MATCH_RULES } from '@/lib/match/table';
  import type { LoadedPack } from '@/lib/pack/types';
  import { safeSlug, searchPets, type PetdexEntry } from '@/lib/petdex';
  import { autoMatch, type CollectionEntry } from '@/lib/settings';
  import { localName, t } from '@/lib/i18n/ui.svelte';
  import { canShare } from '@/lib/share/submit';
  import { sourceLabel } from './labels';
  import ShareDialog from './ShareDialog.svelte';

  let {
    packs,
    collection = {},
    matched = {},
  }: { packs: LoadedPack[]; collection?: Record<string, CollectionEntry>; matched?: Record<string, number> } = $props();

  const imported = $derived(packs.filter((p) => p.source === 'petdex' || p.source === 'user'));
  const importedIds = $derived(new Set(imported.map((p) => p.id)));
  let manifest = $state<PetdexEntry[] | null>(null);
  let loading = $state(false);
  let query = $state('');
  let busy = $state<string | null>(null);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const LIMIT = 24;
  const matches = $derived(manifest ? searchPets(manifest, query, 1000) : []);
  const results = $derived(matches.slice(0, LIMIT));

  let sharing = $state<LoadedPack | null>(null);

  let matching = $state(false);
  void autoMatch.getValue().then((v) => (matching = v));
  autoMatch.watch((v) => (matching = v));

  async function loadManifest() {
    loading = true;
    message = null;
    try {
      manifest = await fetchPetdexManifest();
    } catch (e) {
      message = { kind: 'error', text: String(e instanceof Error ? e.message : e) };
    } finally {
      loading = false;
    }
  }

  async function run(id: string, fn: () => Promise<LoadedPack>) {
    busy = id;
    message = null;
    try {
      const p = await fn();
      message = { kind: 'ok', text: t(canShare(p) ? 'imp.importedOwn' : 'imp.imported', { name: localName(p) }) };
    } catch (e) {
      message = { kind: 'error', text: String(e instanceof Error ? e.message : e) };
    } finally {
      busy = null;
    }
  }

  let dragging = $state(false);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const files = e.dataTransfer?.files;
    if (files?.length) void run('files', () => importFromFiles(files));
  }
</script>

<section>
  <div class="intro">
    <h1 class="display">{t('imp.title')}</h1>
    <p class="hint">{t('imp.intro')}</p>
  </div>

  {#if message}
    <p class="msg {message.kind}" role="status" data-testid="import-message">{message.text}</p>
  {/if}

  <div class="cols">
    <div class="card tilt petdex" style:transform="rotate(-0.4deg)">
      <div class="title-row">
        <h2 class="display">{t('imp.petdex.title')}</h2>
        <a href="https://petdex.dev" target="_blank" rel="noreferrer">{t('imp.petdex.link')}</a>
      </div>
      {#if !manifest}
        <p class="hint">{t('imp.petdex.hint')}</p>
        <button class="btn solid start" onclick={loadManifest} disabled={loading}>{loading ? t('imp.petdex.loading') : t('imp.petdex.load')}</button>
      {:else}
        <label class="search">
          <Icon name="search" size={16} stroke={2.2} />
          <span class="sr-only">{t('imp.petdex.searchLabel')}</span>
          <input type="search" placeholder={t('imp.petdex.searchPh', { n: manifest.length })} bind:value={query} />
        </label>
        <ul class="results">
          {#each results as pet (pet.slug)}
            {@const id = `petdex-${safeSlug(pet.slug)}`}
            <li>
              <span class="initial display" aria-hidden="true">{[...pet.displayName][0] ?? '?'}</span>
              <span class="pname">{pet.displayName}</span>
              <span class="by">{pet.kind ?? 'pet'}{pet.submittedBy ? ` · ${pet.submittedBy}` : ''}</span>
              <button
                class="btn small"
                class:solid={!importedIds.has(id)}
                disabled={busy !== null || importedIds.has(id)}
                onclick={() => run(pet.slug, () => importFromPetdex(pet))}
              >
                {importedIds.has(id) ? t('imp.done') : busy === pet.slug ? t('imp.importing') : t('imp.import')}
              </button>
            </li>
          {:else}
            <li class="none hint">{t('imp.petdex.none')}</li>
          {/each}
        </ul>
        {#if matches.length > LIMIT}<p class="hint small">{t('imp.petdex.more', { n: matches.length, limit: LIMIT })}</p>{/if}
      {/if}
    </div>

    <div class="stack">
      <div class="card tilt" style:transform="rotate(0.5deg)">
        <h2 class="display">{t('imp.own.title')}</h2>
        <label
          class="drop"
          class:dragging
          ondragover={(e) => {
            e.preventDefault();
            dragging = true;
          }}
          ondragleave={() => (dragging = false)}
          ondrop={onDrop}
        >
          <span class="up"><Icon name="upload" size={28} /></span>
          <b>{t('imp.own.drop')}</b>
          <span class="hint small">{t('imp.own.click')}</span>
          <input
            class="sr-only"
            type="file"
            multiple
            accept=".json,.webp,.png"
            data-testid="import-files"
            onchange={(e) => {
              const files = e.currentTarget.files;
              if (files?.length) void run('files', () => importFromFiles(files));
              e.currentTarget.value = '';
            }}
          />
        </label>
        <p class="hint small">{t('imp.own.grid')}</p>
        <p class="hint small share-note"><Icon name="sparkle" size={12} /> {t('imp.own.shareNote')}</p>
      </div>

      <div class="card tilt" style:transform="rotate(-0.3deg)">
        <label class="switch">
          <span>
            <span class="display big">{t('imp.auto.title')}</span> <span class="tag">{t('imp.auto.beta')}</span>
            <span class="hint small block">{t('imp.auto.desc')}</span>
          </span>
          <input type="checkbox" checked={matching} onchange={(e) => autoMatch.setValue(e.currentTarget.checked)} data-testid="auto-match" />
        </label>
        <p class="hint small">{t('imp.auto.fine', { rules: MATCH_RULES.length, max: MAX_AUTO_PACKS })}</p>
      </div>
    </div>
  </div>

  <h2 class="display mine-title">{t('imp.mine.title', { n: imported.length })}</h2>
  {#if imported.length}
    <ul class="mine">
      {#each imported as p (p.id)}
        {@const c = collection[p.id]}
        <li data-testid="imported-pack" data-pack={p.id}>
          <div class="thumb"><Preview pack={p} scale={0.3} /></div>
          <div class="who">
            <div class="pname">{localName(p)}</div>
            <div class="by">{sourceLabel(p, p.id in matched)} · {c ? t('coll.drawn', { n: c.n }) : t('imp.mine.notYet')}</div>
          </div>
          {#if canShare(p)}
            <button class="btn small solid" onclick={() => (sharing = p)} data-testid="share-open"><Icon name="sparkle" size={12} />{t('imp.mine.share')}</button>
          {/if}
          <button class="btn small soft" onclick={() => removeFromCollection(p)}>{t('common.delete')}</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">{t('imp.mine.empty')}</p>
  {/if}
</section>

{#if sharing}
  <ShareDialog pack={sharing} onclose={() => (sharing = null)} />
{/if}

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
    margin: 0;
    font-size: 24px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
    gap: 20px;
    align-items: start;
    margin-top: 26px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card p {
    margin: 0;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .title-row a {
    font-size: 12px;
  }
  .start {
    align-self: flex-start;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 44px;
    border-radius: 999px;
    background: var(--paper);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    outline: none;
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(120px, 100%), 1fr));
    gap: 10px;
    max-height: 520px;
    overflow: auto;
  }
  .results li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 10px;
    border-radius: 14px;
    background: var(--paper);
    text-align: center;
    min-width: 0;
  }
  .results .none {
    grid-column: 1 / -1;
    background: none;
  }
  .initial {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--card);
    border: 2px dashed var(--dash);
    display: grid;
    place-items: center;
    font-size: 24px;
  }
  .pname {
    font-weight: 700;
    font-size: 13px;
    line-height: 1.25;
    word-break: break-word;
  }
  .by {
    font-size: 11px;
    color: var(--muted);
    word-break: break-word;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 24px 16px;
    border-radius: 18px;
    border: 2px dashed var(--dash);
    background: var(--paper);
    text-align: center;
    cursor: pointer;
  }
  .drop.dragging {
    border-color: var(--accent);
    background: var(--pink-soft);
  }
  .up {
    color: var(--link);
  }
  .switch {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
  }
  .switch input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
    flex: none;
    margin-top: 4px;
  }
  .big {
    font-size: 20px;
  }
  .tag {
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--chip);
    vertical-align: 3px;
  }
  .block {
    display: block;
    margin-top: 2px;
  }
  .small {
    font-size: 12px;
  }
  .mine-title {
    margin: 36px 0 12px;
  }
  .mine {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
    gap: 12px;
  }
  .mine li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--card);
    box-shadow: var(--shadow-soft);
  }
  .thumb {
    height: 62px;
    display: grid;
    place-items: end center;
    flex: none;
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  .share-note {
    display: flex;
    gap: 5px;
    align-items: center;
    color: var(--link);
  }
  .msg {
    margin: 16px 0 0;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--card);
  }
  .msg.ok {
    color: var(--ok);
    background: var(--ok-bg);
  }
  .msg.error {
    color: var(--danger);
  }
</style>
