<script lang="ts">
  import type { LoadedPack } from '@/lib/pack/types';
  import { syncAllLibraries } from '@/lib/librarySync';
  import { DEFAULT_LIBRARY } from '@/lib/remote';
  import { libraries, lockedPack, remoteSync, setSiteHidden, type RemoteSyncStatus } from '@/lib/settings';

  let { hidden, locked, packs }: { hidden: string[]; locked: string | null; packs: LoadedPack[] } = $props();

  const lockedName = $derived(packs.find((p) => p.id === locked)?.name ?? locked);

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
      libError = '不是有效的网址';
      return;
    }
    if (url.protocol !== 'https:') {
      libError = '只支持 https 地址';
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
  <h2>远程角色库</h2>
  <p class="hint">
    从网上的角色库（一个 <code>index.json</code> 加若干角色文件夹）下载角色，离线也能用。每 12 小时自动更新一次。当前有 <b data-testid="remote-count">{remoteCount}</b> 个远程角色。
  </p>
  <ul>
    {#each libs as url (url)}
      <li data-testid="library">
        <span class="url">{url}{url === DEFAULT_LIBRARY ? '（默认）' : ''}</span>
        <button
          onclick={async () => {
            await libraries.setValue(libs.filter((u) => u !== url));
            await syncNow();
          }}>移除</button
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
    <input type="url" placeholder="https://…/index.json" bind:value={newLib} aria-label="角色库地址" required />
    <button type="submit">添加</button>
    <button type="button" onclick={syncNow} disabled={syncing} data-testid="sync-now">{syncing ? '同步中…' : '立即同步'}</button>
  </form>
  {#if libError}<p class="err">{libError}</p>{/if}
  {#if status}
    <p class="hint" data-testid="sync-status">
      上次同步：{new Date(status.at).toLocaleString()} · {status.ok ? '成功' : '失败'} · {status.count} 个角色
    </p>
    {#if status.errors.length}
      <details><summary>{status.errors.length} 个问题</summary><ul class="errors">{#each status.errors as e}<li>{e}</li>{/each}</ul></details>
    {/if}
  {/if}

  <h2>锁定的角色</h2>
  {#if locked}
    <p>当前锁定：<b>{lockedName}</b>，不会再自动抽卡。<button onclick={() => lockedPack.setValue(null)}>解锁</button></p>
  {:else}
    <p class="hint">没有锁定。可以在悬浮控制条或图鉴里锁定一个角色。</p>
  {/if}

  <h2>隐藏角色的网站</h2>
  {#if hidden.length}
    <ul>
      {#each hidden as host (host)}
        <li><span>{host}</span><button onclick={() => setSiteHidden(host, false)}>恢复显示</button></li>
      {/each}
    </ul>
  {:else}
    <p class="hint">没有隐藏的网站。</p>
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
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 520px;
  }
  input[type='url'] {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  button {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    border-radius: 8px;
    padding: 5px 12px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
  }
  form.inline {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: 640px;
    margin-top: 8px;
  }
  form.inline input {
    flex: 1;
    min-width: 220px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  .url {
    word-break: break-all;
    margin-right: 8px;
  }
  .err {
    color: #c0392b;
  }
  ul.errors li {
    display: list-item;
    font-size: 12px;
    color: var(--muted);
    border: 0;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    max-width: 640px;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
</style>
