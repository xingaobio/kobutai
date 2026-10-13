<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import LangSwitch from '@/components/LangSwitch.svelte';
  import Logo from '@/components/Logo.svelte';
  import { syncDocumentLang, t } from '@/lib/i18n/ui.svelte';
  import { blobKey, getBlob, isBlobRef } from '@/lib/blobstore';
  import { PackCatalog } from '@/lib/pack/catalog';
  import type { LoadedPack } from '@/lib/pack/types';
  import { setSrcResolver } from '@/lib/render/renderer';
  import { autoMatched, collection, hiddenSites, lockedPack, type CollectionEntry } from '@/lib/settings';
  import CollectionView from './Collection.svelte';
  import ImportView from './Import.svelte';
  import ModelsView from './Models.svelte';
  import SettingsView from './Settings.svelte';

  // Extension pages can read our IndexedDB directly.
  setSrcResolver(async (src) => {
    if (!isBlobRef(src)) return src;
    const blob = await getBlob(blobKey(src));
    if (!blob) throw new Error(`missing asset ${src}`);
    return URL.createObjectURL(blob);
  });

  syncDocumentLang();
  $effect(() => {
    document.title = t('app.title');
  });

  const TABS = ['collection', 'import', 'models', 'settings'] as const;
  type Tab = (typeof TABS)[number];
  const fromHash = (): Tab | null => {
    const h = location.hash.slice(1);
    return (TABS as readonly string[]).includes(h) ? (h as Tab) : null;
  };
  let tab = $state<Tab>(fromHash() ?? 'collection');
  $effect(() => {
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', `#${tab}`);
  });
  // Links like "Import my own character" just change the hash.
  addEventListener('hashchange', () => {
    const next = fromHash();
    if (next) tab = next;
  });

  let packs = $state<LoadedPack[]>([]);
  /** Built-in / library characters deleted from the 图鉴. */
  let removed = $state<LoadedPack[]>([]);
  let coll = $state<Record<string, CollectionEntry>>({});
  let locked = $state<string | null>(null);
  let hidden = $state<string[]>([]);
  let matched = $state<Record<string, number>>({});

  const catalog = new PackCatalog();
  const refreshRemoved = () => void catalog.removed().then((r) => (removed = r));
  void catalog.all().then((p) => (packs = p));
  refreshRemoved();
  catalog.onChange((p) => {
    packs = p;
    refreshRemoved();
  });
  function follow<T>(item: { getValue(): Promise<T>; watch(cb: (v: T) => void): unknown }, set: (v: T) => void) {
    void item.getValue().then(set);
    item.watch(set);
  }
  follow(collection, (v) => (coll = v));
  follow(lockedPack, (v) => (locked = v));
  follow(hiddenSites, (v) => (hidden = v));
  follow(autoMatched, (v) => (matched = v));
</script>

<header>
  <div class="inner">
    <Logo size={34} />
    <div class="tabs" role="tablist" aria-label={t('tabs.aria')}>
      {#each TABS as id (id)}
        <button role="tab" aria-selected={tab === id} class:active={tab === id} onclick={() => (tab = id)} data-tab={id}>
          {#if id === 'models'}<span class="spark"><Icon name="sparkle" size={13} /></span>{/if}
          {t(`tabs.${id}`)}
        </button>
      {/each}
    </div>
    <div class="lang"><LangSwitch /></div>
  </div>
</header>

<main>
  {#if tab === 'collection'}
    <CollectionView {packs} {removed} collection={coll} {locked} {matched} />
  {:else if tab === 'import'}
    <ImportView {packs} collection={coll} {matched} />
  {:else if tab === 'models'}
    <ModelsView />
  {:else}
    <SettingsView {hidden} {locked} {packs} />
  {/if}
</main>

<style>
  header {
    background: var(--surface);
    border-bottom: 4px solid var(--card);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .inner {
    max-width: 1080px;
    margin: 0 auto;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tabs button {
    border: 0;
    background: var(--card);
    color: var(--ink);
    padding: 7px 16px;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .tabs button.active {
    background: var(--pink);
    color: #3a2748;
    font-weight: 700;
    transform: rotate(-2deg);
  }
  .lang {
    margin-left: auto;
  }
  .spark {
    color: var(--link);
    display: inline-flex;
  }
  .active .spark {
    color: inherit;
  }
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }
</style>
