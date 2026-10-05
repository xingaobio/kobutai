<script lang="ts">
  import type { AuthType, Credential, Model, MutableModels, Provider } from '@earendil-works/pi-ai';
  import { CUSTOM_PREFIX, customId, type CustomEndpoint, type LlmSettings } from '@/lib/llm/config';
  import { createHdModels, originPattern, originsFor, pickDefaultModel } from '@/lib/llm/models';
  import { storageCredentialStore } from '@/lib/llm/store';
  import { installId, llmCredentials, llmSettings, migrateLegacyAi, tagCache } from '@/lib/settings';
  import { classify } from '@/lib/tagging/ai';
  import LoginDialog from './LoginDialog.svelte';

  const credentials = storageCredentialStore(llmCredentials);

  let settings = $state<LlmSettings | null>(null);
  let creds = $state<Record<string, Credential>>({});
  let deviceId = $state('');
  let models = $state.raw<MutableModels>(createHdModels(credentials));
  let customSig = '[]';
  let available = $state.raw<Model<string>[]>([]);

  void migrateLegacyAi()
    .catch(() => {})
    .then(async () => {
      deviceId = await installId.getValue();
      creds = await llmCredentials.getValue();
      settings = await llmSettings.getValue();
    });
  llmCredentials.watch((v) => (creds = v));
  llmSettings.watch((v) => (settings = v));

  function rebuild(custom: CustomEndpoint[]) {
    const sig = JSON.stringify(custom);
    if (sig === customSig) return;
    customSig = sig;
    models = createHdModels(credentials, custom);
  }
  $effect(() => {
    if (settings) rebuild($state.snapshot(settings.custom));
  });
  $effect(() => {
    void creds;
    const m = models;
    void m.getAvailable().then((list) => {
      if (m === models) available = [...list];
    });
  });

  const providers = $derived(models.getProviders());
  const providerName = (id: string) => models.getProvider(id)?.name ?? id;
  /** pi-ai keeps the older Codex sign-in next to "Sign in with ChatGPT"; say which is which. */
  const SIGN_IN_NAMES: Record<string, string> = { 'openai-codex': 'OpenAI Codex（旧版 ChatGPT Plus/Pro 登录）' };
  const subscriptions = $derived(
    providers
      .filter((p) => p.auth.oauth)
      .sort((a, b) => Number(!!b.auth.oauth?.isSubscription) - Number(!!a.auth.oauth?.isSubscription) || a.name.localeCompare(b.name)),
  );
  const keyProviders = $derived(
    providers.filter((p) => p.auth.apiKey?.login && !p.id.startsWith(CUSTOM_PREFIX)).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const keyed = $derived(keyProviders.filter((p) => creds[p.id]?.type === 'api_key'));

  /** Available models grouped by provider, for the picker. */
  const groups = $derived.by(() => {
    const out = new Map<string, Model<string>[]>();
    for (const m of available) {
      if (!out.has(m.provider)) out.set(m.provider, []);
      out.get(m.provider)!.push(m);
    }
    return [...out];
  });
  const SEP = '::';
  const selected = $derived(settings?.provider ? `${settings.provider}${SEP}${settings.model}` : '');
  const selectedOk = $derived(available.some((m) => m.provider === settings?.provider && m.id === settings?.model));

  async function update(patch: Partial<LlmSettings>) {
    if (!settings) return;
    const next = { ...$state.snapshot(settings), ...patch };
    settings = next;
    await llmSettings.setValue(next);
  }

  function pick(v: string) {
    const i = v.indexOf(SEP);
    if (i > 0) void update({ provider: v.slice(0, i), model: v.slice(i + SEP.length) });
  }

  // --- Connecting -----------------------------------------------------------

  let dialog = $state<{ providerId: string; type: AuthType; title: string } | null>(null);
  let connectError = $state<string | null>(null);

  async function connect(p: Provider, type: AuthType) {
    connectError = null;
    const title = type === 'oauth' ? (p.auth.oauth?.loginLabel ?? p.auth.oauth?.name ?? p.name) : p.name;
    // Calls go straight from the extension to the provider: ask for exactly its hosts.
    // Some providers allow cross-origin calls anyway, so a refusal is a warning, not a stop.
    const origins = originsFor(models, p.id, type);
    const ok = !origins.length || (await browser.permissions.request({ origins }).catch(() => false));
    if (!ok) connectError = `没有获得访问 ${p.name} 服务器的权限，连接或请求可能会失败。`;
    dialog = { providerId: p.id, type, title };
  }

  async function connected(providerId: string) {
    dialog = null;
    const list = await models.getAvailable(providerId);
    if (!selectedOk) {
      const m = pickDefaultModel(list);
      if (m) await update({ enabled: true, provider: m.provider, model: m.id });
    }
  }

  async function disconnect(id: string) {
    await models.logout(id);
  }

  let keyPick = $state('');

  // --- Custom endpoints ------------------------------------------------------

  const EMPTY = { name: '', baseUrl: '', api: 'openai-completions' as CustomEndpoint['api'], models: '' };
  let form = $state({ ...EMPTY });
  let customError = $state<string | null>(null);

  async function addCustom() {
    customError = null;
    if (!settings) return;
    let url: URL;
    try {
      url = new URL(form.baseUrl.trim());
    } catch {
      customError = '不是有效的网址';
      return;
    }
    const origin = /^https?:$/.test(url.protocol) ? originPattern(url.href) : null;
    if (!origin) {
      customError = '只支持 http / https 地址';
      return;
    }
    const ids = form.models.split(/[\s,，]+/).filter(Boolean);
    if (!ids.length) {
      customError = '至少填一个模型 ID';
      return;
    }
    if (!(await browser.permissions.request({ origins: [origin] }).catch(() => false)))
      customError = `没有获得访问 ${url.host} 的权限：服务器不允许跨域访问时请求会失败。`;
    const name = form.name.trim() || url.host;
    const c: CustomEndpoint = {
      id: customId(name, settings.custom.map((x) => x.id)),
      name,
      baseUrl: url.href,
      api: form.api,
      models: ids,
    };
    const custom = [...$state.snapshot(settings.custom), c];
    rebuild(custom);
    await update({ custom, ...(selectedOk ? {} : { enabled: true, provider: c.id, model: ids[0]! }) });
    form = { ...EMPTY };
  }

  async function removeCustom(id: string) {
    if (!settings) return;
    const custom = $state.snapshot(settings.custom).filter((c) => c.id !== id);
    await credentials.delete(id);
    rebuild(custom);
    await update({ custom, ...(settings.provider === id ? { provider: '', model: '' } : {}) });
  }

  // --- Test -------------------------------------------------------------------

  const SAMPLE = { site: 'www.youtube.com', title: 'YOASOBI「アイドル」 Official Music Video', artist: 'Ayase / YOASOBI' };
  let testing = $state(false);
  let testResult = $state<string | null>(null);

  async function test() {
    if (!settings) return;
    testing = true;
    testResult = null;
    const r = await classify(SAMPLE, settings, models);
    testResult = r.ok ? `✅ 成功：${r.tags.type} / ${r.tags.genre ?? '—'}` : `❌ 失败：${r.error}`;
    testing = false;
  }
</script>

{#if settings}
  <section>
    <h2>AI 识别</h2>
    <p class="hint">
      默认用本地规则识别曲风。连接一个模型后，会用它识别新内容：只发送标题、作者和网站域名，结果按内容缓存。 API
      key 和登录凭证只保存在这台电脑的浏览器里，请求直接从扩展发到模型服务商。
    </p>
    <label class="row"
      ><input type="checkbox" checked={settings.enabled} onchange={(e) => update({ enabled: e.currentTarget.checked })} /> 启用
      AI 识别</label
    >
    <label class="field">
      模型
      <select value={selectedOk ? selected : ''} onchange={(e) => pick(e.currentTarget.value)} data-testid="model-select">
        <option value="" disabled>{available.length ? '选择一个模型' : '先在下面连接一个服务商'}</option>
        {#each groups as [provider, list] (provider)}
          <optgroup label={providerName(provider)}>
            {#each list as m (m.id)}
              <option value={`${provider}${SEP}${m.id}`}>{m.name}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </label>
    {#if settings.provider && !selectedOk && available.length}
      <p class="warn">之前选的模型（{settings.model}）现在用不了，请重新选择。</p>
    {/if}
    <div class="actions">
      <button type="button" onclick={test} disabled={testing || !selectedOk} data-testid="model-test">{testing ? '测试中…' : '测试'}</button>
      <button type="button" onclick={() => tagCache.setValue({})}>清空识别缓存</button>
    </div>
    {#if testResult}<p class="result" data-testid="model-test-result">{testResult}</p>{/if}

    <h2>订阅登录</h2>
    <p class="hint">用你已经付费的订阅额度，不需要 API key。点"登录"会打开服务商的登录页面。</p>
    <ul>
      {#each subscriptions as p (p.id)}
        {@const c = creds[p.id]}
        <li data-testid="subscription">
          <span>
            {SIGN_IN_NAMES[p.id] ?? p.auth.oauth?.name}
            {#if c?.type === 'oauth'}<span class="ok">· 已登录</span>{/if}
          </span>
          {#if c?.type === 'oauth'}
            <button type="button" onclick={() => disconnect(p.id)}>退出</button>
          {:else}
            <button type="button" onclick={() => connect(p, 'oauth')}>登录</button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="hint small">
      Claude 不在这里：Anthropic 的条款不允许第三方应用使用 Claude Pro/Max 订阅登录，请用下面的 Anthropic API key。
    </p>

    <h2>API key</h2>
    <p class="hint">按量计费的 API key。</p>
    <div class="inline">
      <select bind:value={keyPick} aria-label="服务商" data-testid="key-provider">
        <option value="" disabled>选择服务商</option>
        {#each keyProviders as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <button
        type="button"
        disabled={!keyPick}
        onclick={() => {
          const p = models.getProvider(keyPick);
          if (p) void connect(p, 'api_key');
        }}>添加 key</button
      >
    </div>
    {#if keyed.length}
      <ul>
        {#each keyed as p (p.id)}
          <li data-testid="keyed">
            <span>{p.name} <span class="ok">· 已添加</span></span>
            <button type="button" onclick={() => disconnect(p.id)}>移除</button>
          </li>
        {/each}
      </ul>
    {/if}

    <h2>自定义端点</h2>
    <p class="hint">本地或自建的模型服务：Ollama、LM Studio、vLLM、各种 OpenAI / Anthropic 兼容网关。</p>
    {#if settings.custom.length}
      <ul>
        {#each settings.custom as c (c.id)}
          <li data-testid="custom">
            <span class="url">
              {c.name} · {c.baseUrl} · {c.models.join(', ')}
              {#if creds[c.id]}<span class="ok">· 有 key</span>{/if}
            </span>
            <span class="btns">
              <button type="button" onclick={() => connect(models.getProvider(c.id)!, 'api_key')}>{creds[c.id] ? '换 key' : '设置 key'}</button>
              <button type="button" onclick={() => removeCustom(c.id)}>删除</button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
    <form
      class="custom"
      onsubmit={(e) => {
        e.preventDefault();
        void addCustom();
      }}
    >
      <label class="field">名称 <input type="text" placeholder="Ollama" bind:value={form.name} /></label>
      <label class="field"
        >Base URL <input type="text" placeholder="http://localhost:11434/v1" bind:value={form.baseUrl} required data-testid="custom-url" /></label
      >
      <label class="field">
        接口格式
        <select bind:value={form.api}>
          <option value="openai-completions">OpenAI 兼容（/chat/completions）</option>
          <option value="anthropic-messages">Anthropic 兼容（/v1/messages）</option>
        </select>
      </label>
      <label class="field"
        >模型 ID（多个用逗号分隔）<input type="text" placeholder="qwen3:8b" bind:value={form.models} required data-testid="custom-models" /></label
      >
      <div class="actions"><button type="submit">添加端点</button></div>
    </form>
    {#if customError}<p class="err">{customError}</p>{/if}
    {#if connectError}<p class="err">{connectError}</p>{/if}
  </section>

  {#if dialog}
    {@const d = dialog}
    <LoginDialog
      {models}
      providerId={d.providerId}
      type={d.type}
      title={d.title}
      {deviceId}
      ondone={(ok) => (ok ? void connected(d.providerId) : (dialog = null))}
    />
  {/if}
{/if}

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
    max-width: 640px;
  }
  .small {
    font-size: 12px;
    margin-top: 8px;
  }
  label.row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }
  label.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--muted);
    font-size: 13px;
    max-width: 520px;
  }
  input[type='text'],
  select {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    font: inherit;
    min-width: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .inline {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    max-width: 640px;
  }
  .inline select {
    flex: 1;
    min-width: 200px;
  }
  form.custom {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  button {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    border-radius: 8px;
    padding: 5px 12px;
    cursor: pointer;
    font: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    max-width: 640px;
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .btns {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .url {
    word-break: break-all;
  }
  .ok {
    color: var(--accent);
  }
  .warn {
    color: #b9770e;
    margin: 6px 0 0;
  }
  .err {
    color: #c0392b;
  }
  .result {
    margin: 8px 0 0;
    word-break: break-word;
  }
</style>
