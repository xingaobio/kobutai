<script lang="ts">
  import type { LoadedPack } from '@/lib/pack/types';
  import { aiSettings, lockedPack, setSiteHidden, tagCache } from '@/lib/settings';
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
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    max-width: 520px;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
</style>
