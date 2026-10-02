<script lang="ts">
  import Preview from '@/components/Preview.svelte';
  import { fetchPetdexManifest, importFromFiles, importFromPetdex, removeUserPack } from '@/lib/importer';
  import type { LoadedPack } from '@/lib/pack/types';
  import { searchPets, type PetdexEntry } from '@/lib/petdex';

  let { packs }: { packs: LoadedPack[] } = $props();

  const imported = $derived(packs.filter((p) => p.source !== 'builtin'));
  let manifest = $state<PetdexEntry[] | null>(null);
  let loading = $state(false);
  let query = $state('');
  let busy = $state<string | null>(null);
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const results = $derived(manifest ? searchPets(manifest, query, 40) : []);
  const importedIds = $derived(new Set(imported.map((p) => p.id)));

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
      message = { kind: 'ok', text: `已导入「${p.name}」，它会出现在通用池里。` };
    } catch (e) {
      message = { kind: 'error', text: String(e instanceof Error ? e.message : e) };
    } finally {
      busy = null;
    }
  }
</script>

<section>
  <h2>从 Petdex 导入</h2>
  <p class="hint">
    <a href="https://petdex.dev" target="_blank" rel="noreferrer">Petdex</a> 上有几千个社区宠物。导入后它们进入"通用池"，所有内容都可能抽到。素材版权归投稿者，仅供个人使用，不会随扩展分发。
  </p>
  {#if !manifest}
    <button class="primary" onclick={loadManifest} disabled={loading}>{loading ? '加载中…' : '加载 Petdex 列表'}</button>
  {:else}
    <input class="search" type="search" placeholder="搜索 {manifest.length} 个宠物…" bind:value={query} aria-label="搜索 Petdex" />
    <ul class="results">
      {#each results as pet (pet.slug)}
        {@const id = `petdex-${pet.slug.toLowerCase().replace(/[^a-z0-9-_]+/g, '-')}`}
        <li>
          <span class="pname">{pet.displayName}</span>
          <span class="by">{pet.kind ?? ''}{pet.submittedBy ? ` · ${pet.submittedBy}` : ''}</span>
          <button disabled={busy !== null || importedIds.has(id)} onclick={() => run(pet.slug, () => importFromPetdex(pet))}>
            {importedIds.has(id) ? '已导入' : busy === pet.slug ? '导入中…' : '导入'}
          </button>
        </li>
      {:else}
        <li class="empty">没有匹配的宠物</li>
      {/each}
    </ul>
  {/if}

  <h2>从本地文件导入</h2>
  <p class="hint">选择一个 Petdex / Codex 宠物文件夹里的 <code>pet.json</code> 和 <code>spritesheet.webp</code>（可多选）。</p>
  <input
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

  {#if message}
    <p class="msg {message.kind}" role="status" data-testid="import-message">{message.text}</p>
  {/if}

  <h2>已导入的角色（{imported.length}）</h2>
  {#if imported.length}
    <ul class="mine">
      {#each imported as p (p.id)}
        <li data-testid="imported-pack" data-pack={p.id}>
          <Preview pack={p} scale={0.4} />
          <div>
            <div class="pname">{p.name}</div>
            <div class="by">{p.author ?? ''}</div>
          </div>
          <button onclick={() => removeUserPack(p.id)}>删除</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">还没有导入任何角色。</p>
  {/if}
</section>

<style>
  h2 {
    font-size: 17px;
    margin: 28px 0 4px;
  }
  h2:first-child {
    margin-top: 0;
  }
  .hint {
    color: var(--muted);
    margin: 0 0 12px;
  }
  a {
    color: var(--accent);
  }
  button {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    border-radius: 8px;
    padding: 4px 12px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    padding: 8px 16px;
  }
  .search {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
  }
  .results li,
  .mine li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 4px;
    border-bottom: 1px solid var(--line);
  }
  .results li .by {
    flex: 1;
  }
  .mine li > div {
    flex: 1;
  }
  .pname {
    font-weight: 600;
  }
  .by {
    color: var(--muted);
    font-size: 12px;
  }
  .empty {
    color: var(--muted);
  }
  .msg {
    padding: 8px 12px;
    border-radius: 8px;
  }
  .msg.ok {
    background: var(--accent-soft);
  }
  .msg.error {
    background: #ffdada;
    color: #7a1010;
  }
</style>
