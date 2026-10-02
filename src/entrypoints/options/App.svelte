<script lang="ts">
  import { blobKey, getBlob, isBlobRef } from '@/lib/blobstore';
  import { PackCatalog } from '@/lib/pack/catalog';
  import type { LoadedPack } from '@/lib/pack/types';
  import { setSrcResolver } from '@/lib/render/renderer';
  import { aiSettings, collection, hiddenSites, lockedPack, type CollectionEntry } from '@/lib/settings';
  import CollectionView from './Collection.svelte';
  import ImportView from './Import.svelte';
  import SettingsView from './Settings.svelte';

  // Extension pages can read our IndexedDB directly.
  setSrcResolver(async (src) => {
    if (!isBlobRef(src)) return src;
    const blob = await getBlob(blobKey(src));
    if (!blob) throw new Error(`missing asset ${src}`);
    return URL.createObjectURL(blob);
  });

  const TABS = [
    { id: 'collection', label: '图鉴' },
    { id: 'import', label: '导入角色' },
    { id: 'settings', label: '设置' },
  ] as const;
  type Tab = (typeof TABS)[number]['id'];
  const initial = location.hash.slice(1) as Tab;
  let tab = $state<Tab>(TABS.some((t) => t.id === initial) ? initial : 'collection');
  $effect(() => {
    history.replaceState(null, '', `#${tab}`);
  });

  let packs = $state<LoadedPack[]>([]);
  let coll = $state<Record<string, CollectionEntry>>({});
  let locked = $state<string | null>(null);
  let hidden = $state<string[]>([]);
  let ai = $state(aiSettings.fallback);

  const catalog = new PackCatalog();
  void catalog.all().then((p) => (packs = p));
  catalog.onChange((p) => (packs = p));
  function follow<T>(item: { getValue(): Promise<T>; watch(cb: (v: T) => void): unknown }, set: (v: T) => void) {
    void item.getValue().then(set);
    item.watch(set);
  }
  follow(collection, (v) => (coll = v));
  follow(lockedPack, (v) => (locked = v));
  follow(hiddenSites, (v) => (hidden = v));
  follow(aiSettings, (v) => (ai = v));
</script>

<header>
  <h1>HappyDesk</h1>
  <div class="tabs" role="tablist">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
    {/each}
  </div>
</header>

<main>
  {#if tab === 'collection'}
    <CollectionView {packs} collection={coll} {locked} />
  {:else if tab === 'import'}
    <ImportView {packs} />
  {:else}
    <SettingsView {ai} {hidden} {locked} {packs} />
  {/if}
</main>

<style>
  :global(:root) {
    --bg: #f7f7fa;
    --card: #ffffff;
    --text: #18181e;
    --muted: #6b6b78;
    --line: #e4e4ea;
    --accent: #e0559b;
    --accent-soft: #ffe3f1;
    --silhouette: brightness(0) opacity(0.25);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #141418;
      --card: #1e1e24;
      --text: #f2f2f5;
      --muted: #a0a0ad;
      --line: #2e2e36;
      --accent: #ff8fc7;
      --accent-soft: #3a2230;
      --silhouette: brightness(0) invert(1) opacity(0.2);
      color-scheme: dark;
    }
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.55 system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  }
  :global(button) {
    font: inherit;
  }
  header {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 16px max(16px, calc((100vw - 960px) / 2));
    border-bottom: 1px solid var(--line);
    background: var(--card);
    position: sticky;
    top: 0;
    z-index: 1;
    flex-wrap: wrap;
  }
  h1 {
    font-size: 18px;
    margin: 0;
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    border: 0;
    background: none;
    color: var(--muted);
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
  }
  .tabs button.active {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 16px 64px;
  }
</style>
