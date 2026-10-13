<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Preview from '@/components/Preview.svelte';
  import { removeFromCollection, restorePacks } from '@/lib/importer';
  import type { LoadedPack } from '@/lib/pack/types';
  import { lockedPack, type CollectionEntry } from '@/lib/settings';
  import { localName, t } from '@/lib/i18n/ui.svelte';
  import { credit, poolLabel, photoColor, sourceLabel } from './labels';

  let {
    packs,
    removed = [],
    collection,
    locked,
    matched = {},
  }: {
    packs: LoadedPack[];
    /** Built-in / library characters deleted from the 图鉴; they can be restored. */
    removed?: LoadedPack[];
    collection: Record<string, CollectionEntry>;
    locked: string | null;
    /** Packs the auto-match feature downloaded (id → last used). */
    matched?: Record<string, number>;
  } = $props();

  type Filter = 'all' | 'builtin' | 'mine' | 'remote';
  let filter = $state<Filter>('all');
  const isMine = (p: LoadedPack) => p.source === 'petdex' || p.source === 'user';
  const counts = $derived({
    all: packs.length,
    builtin: packs.filter((p) => p.source === 'builtin').length,
    mine: packs.filter(isMine).length,
    remote: packs.filter((p) => p.source === 'remote').length,
  });
  const FILTERS: Filter[] = ['all', 'builtin', 'mine', 'remote'];

  const got = $derived(packs.filter((p) => collection[p.id]).length);
  const shown = $derived(
    packs
      .filter((p) => filter === 'all' || (filter === 'mine' ? isMine(p) : p.source === filter))
      .sort((a, b) => Number(!!collection[b.id]) - Number(!!collection[a.id]) || localName(a).localeCompare(localName(b))),
  );
  const TILT = [-1.2, 0.9, -0.6, 1.1, -0.8, 0.6, -1, 0.7];
  const TAPE = ['var(--lemon-tape)', 'var(--sky-tape)', 'var(--pink-tape)'];

  /** Imported characters are erased; built-in and library ones only leave the 图鉴 and can come back. */
  const restorable = (p: LoadedPack) => p.source === 'builtin' || p.source === 'remote';
  /** The card asking "really delete?". */
  let confirming = $state<string | null>(null);
  let busy = $state(false);

  async function remove(p: LoadedPack) {
    // The overlay always needs one character to show.
    if (busy || packs.length <= 1) return;
    busy = true;
    try {
      await removeFromCollection(p);
    } finally {
      busy = false;
      confirming = null;
    }
  }
</script>

<section>
  <div class="head">
    <div class="intro">
      <h1 class="display">{t('coll.title')}</h1>
      <p class="hint">{t('coll.intro')}</p>
    </div>
    <p class="progress display" data-testid="collection-progress">{t('coll.progress')} <b>{got}</b> / {packs.length}</p>
  </div>

  <div class="filters" role="group" aria-label={t('coll.filter.aria')}>
    {#each FILTERS as f (f)}
      {#if f === 'all' || counts[f]}
        <button class="btn" class:solid={filter === f} class:soft={filter !== f} aria-pressed={filter === f} onclick={() => (filter = f)}>
          {t(`coll.filter.${f}`)} {counts[f]}
        </button>
      {/if}
    {/each}
    <a class="add" href="#import"><Icon name="plus" size={14} stroke={2.4} />{t('coll.addMine')}</a>
  </div>

  <ul class="grid">
    {#each shown as p, i (p.id)}
      {@const c = collection[p.id]}
      {@const name = c ? localName(p) : null}
      <li
        class="tile tilt"
        class:missing={!c}
        style:transform="rotate({TILT[i % TILT.length]}deg)"
        data-testid="collection-card"
        data-pack={p.id}
        data-collected={!!c}
      >
        {#if c}<span class="tape" aria-hidden="true" style:background={TAPE[i % TAPE.length]}></span>{/if}
        {#if isMine(p)}<span class="badge">{t('coll.badgeImported')}</span>{/if}
        <div class="photo" style:background={c ? photoColor(p.id) : undefined}><Preview pack={p} scale={0.72} /></div>
        <div class="name display">{name ?? '？？？'}</div>
        <div class="meta">
          {isMine(p) ? sourceLabel(p, p.id in matched) : poolLabel(p)}{#if c} · {t('coll.drawn', { n: c.n })}{/if}
        </div>
        {#if c && credit(p)}<div class="meta credit" data-testid="collection-credit">{credit(p)}</div>{/if}
        {#if confirming === p.id}
          <div class="confirm" role="group" aria-label={name ? t('coll.confirmNamed', { name }) : t('coll.confirmUnnamed')} data-testid="collection-confirm">
            <p>
              {name ? t('coll.confirmNamed', { name }) : t('coll.confirmUnnamed')}{restorable(p) ? t('coll.confirmRestorable') : t('coll.confirmImported')}
            </p>
            <div class="row">
              <button class="btn small danger" disabled={busy} onclick={() => remove(p)} data-testid="collection-delete-yes">{t('common.delete')}</button>
              <button class="btn small" onclick={() => (confirming = null)}>{t('common.cancel')}</button>
            </div>
          </div>
        {:else}
          <div class="row">
            {#if c}
              <button
                class="btn small"
                class:solid={locked === p.id}
                aria-pressed={locked === p.id}
                onclick={() => lockedPack.setValue(locked === p.id ? null : p.id)}
              >
                {#if locked === p.id}<Icon name="lock" size={12} stroke={2.6} />{t('common.locked')}{:else}{t('common.lock')}{/if}
              </button>
            {/if}
            <button
              class="btn small soft"
              disabled={packs.length <= 1}
              title={packs.length <= 1 ? t('coll.keepOne') : undefined}
              onclick={() => (confirming = p.id)}
              data-testid="collection-delete">{t('common.delete')}</button
            >
          </div>
        {/if}
      </li>
    {:else}
      <li class="empty hint">{t('coll.empty')}</li>
    {/each}
  </ul>

  {#if removed.length}
    <div class="removed-box">
      <div class="head">
        <h2 class="display">{t('coll.removedTitle', { n: removed.length })}</h2>
        <button class="btn" onclick={() => restorePacks()} data-testid="collection-restore-all">{t('coll.restoreAll')}</button>
      </div>
      <p class="hint">{t('coll.removedHint')}</p>
      <ul class="removed">
        {#each removed as p (p.id)}
          {@const c = collection[p.id]}
          <li class:missing={!c} data-testid="collection-removed" data-pack={p.id}>
            <div class="thumb"><Preview pack={p} scale={0.3} /></div>
            <span>{c ? localName(p) : '？？？'} <span class="hint small">{poolLabel(p)}</span></span>
            <button class="btn small" onclick={() => restorePacks([p.id])} data-testid="collection-restore">{t('coll.restore')}</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .intro {
    max-width: 620px;
  }
  h1 {
    margin: 0;
    font-size: 44px;
    line-height: 1.1;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  .intro p {
    margin: 4px 0 0;
  }
  .progress {
    margin: 0;
    font-size: 22px;
  }
  .progress b {
    color: var(--link);
    font-size: 30px;
    font-weight: 400;
  }
  .filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 22px 0 26px;
    align-items: center;
  }
  .filters .btn.soft {
    background: var(--card);
  }
  .add {
    margin-left: auto;
    height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--card);
    color: var(--ink);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    border: 2px dashed var(--dash);
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr));
    gap: 24px 18px;
  }
  .tile {
    position: relative;
    background: var(--card);
    border-radius: 16px;
    padding: 10px 10px 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-align: center;
    box-shadow: var(--shadow);
  }
  .tape {
    position: absolute;
    top: -9px;
    left: 50%;
    width: 64px;
    height: 18px;
    margin-left: -32px;
    transform: rotate(-3deg);
  }
  .badge {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 1;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--card);
    font-size: 11px;
    font-weight: 700;
  }
  .photo {
    align-self: stretch;
    height: 164px;
    border-radius: 10px;
    background: var(--chip);
    display: grid;
    place-items: end center;
    overflow: hidden;
  }
  .photo :global(.frame) {
    filter: var(--sticker);
  }
  .missing .photo :global(.frame),
  .missing .thumb {
    filter: var(--silhouette);
  }
  .name {
    font-size: 18px;
    margin-top: 4px;
    line-height: 1.3;
  }
  .meta {
    font-size: 12px;
    color: var(--muted);
  }
  .credit {
    font-size: 11px;
    word-break: break-word;
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .confirm {
    margin-top: 6px;
    font-size: 12px;
  }
  .confirm p {
    margin: 0;
    color: var(--muted);
  }
  .empty {
    grid-column: 1 / -1;
  }
  .removed-box {
    margin-top: 40px;
    padding: 18px 20px;
    border-radius: 18px;
    border: 2px dashed var(--dash);
    background: color-mix(in srgb, var(--card) 60%, transparent);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .removed-box .hint {
    margin: 0;
    font-size: 13px;
  }
  .removed {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .removed li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px 6px 8px;
    border-radius: 14px;
    background: var(--card);
  }
  .thumb {
    height: 62px;
    display: grid;
    place-items: end center;
  }
  .small {
    font-size: 12px;
  }
</style>
