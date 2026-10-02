<script lang="ts">
  import type { LoadedPack } from '@/lib/pack/types';
  import { syncAllLibraries } from '@/lib/librarySync';
  import { DEFAULT_LIBRARY } from '@/lib/remote';
  import { aiSettings, libraries, lockedPack, remoteSync, setSiteHidden, tagCache, type RemoteSyncStatus } from '@/lib/settings';
  import { aiTags, type AiSettings } from '@/lib/tagging/ai';

  let { ai, hidden, locked, packs }: { ai: AiSettings; hidden: string[]; locked: string | null; packs: LoadedPack[] } = $props();

  // Local editable copy; saved explicitly.
  // svelte-ignore state_referenced_locally
  let form = $state({ ...ai });
  let saved = $state(false);
  let testResult = $state<string | null>(null);
  let testing = $state(false);

  async function save() {
    await aiSettings.setValue($state.snapshot(form));
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }

  async function test() {
    testing = true;
    testResult = null;
    const t = await aiTags(
      { site: 'www.youtube.com', title: 'YOASOBI「アイドル」 Official Music Video', artist: 'Ayase / YOASOBI' },
      { ...$state.snapshot(form), enabled: true },
    );
    testResult = t ? `✅ 成功：${t.type} / ${t.genre ?? '—'}` : '❌ 失败：请检查 API key、模型名和网络（详情见扩展控制台）';
    testing = false;
  }

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
  <h2>AI 识别（可选）</h2>
  <p class="hint">
    默认用本地规则识别曲风。填入你自己的 Anthropic API key 后，会用 Claude 识别新内容。只发送标题、作者和网站域名，结果按内容缓存。key 只保存在本机浏览器里。
  </p>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <label class="row"><input type="checkbox" bind:checked={form.enabled} /> 启用 AI 识别</label>
    <label>API key <input type="password" autocomplete="off" placeholder="sk-ant-…" bind:value={form.apiKey} /></label>
    <label>模型 <input type="text" bind:value={form.model} /></label>
    <label>Base URL（可选，代理或网关） <input type="url" placeholder="https://api.anthropic.com" bind:value={form.baseURL} /></label>
    <div class="actions">
      <button class="primary" type="submit">保存</button>
      <button type="button" onclick={test} disabled={testing || !form.apiKey}>{testing ? '测试中…' : '测试连接'}</button>
      <button type="button" onclick={() => tagCache.setValue({})}>清空识别缓存</button>
      {#if saved}<span class="ok">已保存</span>{/if}
    </div>
    {#if testResult}<p class="result">{testResult}</p>{/if}
  </form>

  <h2>远程角色库</h2>
  <p class="hint">
    从网上的角色库（一个 <code>index.json</code> 加若干角色文件夹）下载角色，离线也能用。每 12 小时自动更新一次。当前有 <b data-testid="remote-count">{remoteCount}</b> 个远程角色。
  </p>
  <ul>
    {#each libs as url (url)}
      <li data-testid="library">
        <span class="url">{url}{url === DEFAULT_LIBRARY ? '（默认）' : ''}</span>
        <button onclick={() => libraries.setValue(libs.filter((u) => u !== url))}>移除</button>
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
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
    font-size: 13px;
  }
  label.row {
    flex-direction: row;
    align-items: center;
    color: var(--text);
    font-size: 14px;
  }
  input[type='text'],
  input[type='password'],
  input[type='url'] {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  button {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    border-radius: 8px;
    padding: 5px 12px;
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  button:disabled {
    opacity: 0.5;
  }
  .ok {
    color: var(--accent);
  }
  .result {
    margin: 0;
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
