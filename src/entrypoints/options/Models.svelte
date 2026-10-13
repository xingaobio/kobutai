<script lang="ts">
  import type { AuthType, Credential, Model, MutableModels, Provider } from '@earendil-works/pi-ai';
  import { CUSTOM_PREFIX, customId, type CustomEndpoint, type LlmSettings } from '@/lib/llm/config';
  import { createHdModels, originPattern, originsFor, pickDefaultModel } from '@/lib/llm/models';
  import { storageCredentialStore } from '@/lib/llm/store';
  import { installId, llmCredentials, llmSettings, migrateLegacyAi, tagCache } from '@/lib/settings';
  import { classify } from '@/lib/tagging/ai';
  import Icon from '@/components/Icon.svelte';
  import { t } from '@/lib/i18n/ui.svelte';
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
  const signInName = (p: Provider) => (p.id === 'openai-codex' ? t('models.codexName') : p.auth.oauth?.name);
  const subscriptions = $derived(
    providers
      .filter((p) => p.auth.oauth)
      .sort((a, b) => Number(!!b.auth.oauth?.isSubscription) - Number(!!a.auth.oauth?.isSubscription) || a.name.localeCompare(b.name)),
  );
  const keyProviders = $derived(
    providers.filter((p) => p.auth.apiKey?.login && !p.id.startsWith(CUSTOM_PREFIX)).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const keyed = $derived(keyProviders.filter((p) => creds[p.id]?.type === 'api_key'));
  /**
   * Providers with a free allowance that is plenty for tagging (checked 2026-10; they change,
   * so the page says "有免费额度" and sends people to the provider for the numbers).
   */
  const FREE_TIER: { id: string; label: () => string; url: string }[] = [
    { id: 'nvidia', label: () => 'NVIDIA', url: 'https://build.nvidia.com/' },
    { id: 'google', label: () => 'Google AI Studio (Gemini)', url: 'https://aistudio.google.com/apikey' },
    { id: 'groq', label: () => 'Groq', url: 'https://console.groq.com/keys' },
    { id: 'openrouter', label: () => t('models.free.openrouter'), url: 'https://openrouter.ai/keys' },
  ];
  const freeIds = new Set(FREE_TIER.map((f) => f.id));
  /** Free-tier providers not connected yet, offered as one-click rows. */
  const freeToAdd = $derived(FREE_TIER.filter((f) => creds[f.id]?.type !== 'api_key' && models.getProvider(f.id)));
  const selectedModel = $derived(available.find((m) => m.provider === settings?.provider && m.id === settings?.model));

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
    if (!ok) connectError = t('models.err.permission', { name: p.name });
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
      customError = t('common.invalidUrl');
      return;
    }
    const origin = /^https?:$/.test(url.protocol) ? originPattern(url.href) : null;
    if (!origin) {
      customError = t('models.err.httpOnly');
      return;
    }
    const ids = form.models.split(/[\s,，]+/).filter(Boolean);
    if (!ids.length) {
      customError = t('models.err.noModel');
      return;
    }
    if (!(await browser.permissions.request({ origins: [origin] }).catch(() => false)))
      customError = t('models.err.hostPermission', { host: url.host });
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
  let testOk = $state(false);

  async function test() {
    if (!settings) return;
    testing = true;
    testResult = null;
    const r = await classify(SAMPLE, settings, models);
    testResult = r.ok ? t('models.test.ok', { type: r.tags.type, genre: r.tags.genre ?? '—' }) : t('models.test.fail', { error: r.error });
    testOk = r.ok;
    testing = false;
  }
</script>

{#if settings}
  <section>
    <div class="intro">
      <h1 class="display">{t('models.title')}</h1>
      <p class="hint">{t('models.intro')}</p>
    </div>

    <div class="two">
      <div class="card tilt status" style:transform="rotate(-0.4deg)">
        <label class="switch">
          <span class="lead"><span class="spark"><Icon name="sparkle" size={22} /></span><span class="display big">{t('models.toggle')}</span></span>
          <input type="checkbox" checked={settings.enabled} onchange={(e) => update({ enabled: e.currentTarget.checked })} aria-label={t('models.toggleAria')} />
        </label>
        {#if settings.enabled && selectedOk}
          <div class="state ok" data-testid="model-status">
            <b><Icon name="check" size={16} stroke={2.6} /> {t('models.connected')} · {providerName(settings.provider)} · {selectedModel?.name ?? settings.model}</b>
            {#if freeIds.has(settings.provider)}<span class="small">{t('models.freeProvider')}</span>{/if}
          </div>
        {:else}
          <div class="state" data-testid="model-status">
            {settings.enabled ? t('models.noModelYet') : t('models.off')}
          </div>
        {/if}
        <label class="field">
          {t('models.model')}
          <select value={selectedOk ? selected : ''} onchange={(e) => pick(e.currentTarget.value)} data-testid="model-select">
            <option value="" disabled>{available.length ? t('models.pick') : t('models.connectFirst')}</option>
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
          <p class="warn">{t('models.stale', { model: settings.model })}</p>
        {/if}
        <div class="actions">
          <button class="btn solid" type="button" onclick={test} disabled={testing || !selectedOk} data-testid="model-test">{testing ? t('models.testing') : t('models.test')}</button>
          <button class="btn" type="button" onclick={() => tagCache.setValue({})}>{t('models.clearCache')}</button>
        </div>
        {#if testResult}<p class="result" class:good={testOk} data-testid="model-test-result">{t('models.test.label')}{testResult}</p>{/if}
      </div>

      <aside class="note tilt" style:transform="rotate(0.5deg)" data-testid="free-note">
        <h2 class="display">{t('models.free.title')}</h2>
        <p>{t('models.free.p1')}</p>
        <p>
          {t('models.free.list')}{#each FREE_TIER as f, i (f.id)}{i ? t('common.listSep') : ''}<a href={f.url} target="_blank" rel="noreferrer">{f.label()}</a>{/each}{t('models.free.p2')}
        </p>
        <p class="fine">{t('models.free.fine')}</p>
      </aside>
    </div>

    <div class="three">
      <div class="card">
        <h2 class="display">API key</h2>
        <p class="hint small">{t('models.key.hint')}</p>
        <ul>
          {#each keyed as p (p.id)}
            <li data-testid="keyed">
              <span class="grow">{p.name} {#if freeIds.has(p.id)}<span class="free">{t('models.freeTag')}</span>{/if}</span>
              <span class="okword">{t('models.key.added')}</span>
              <button class="btn small soft" type="button" onclick={() => disconnect(p.id)}>{t('common.remove')}</button>
            </li>
          {/each}
          {#each freeToAdd as f (f.id)}
            <li>
              <span class="grow">{providerName(f.id)} <span class="free">{t('models.freeTag')}</span></span>
              <button class="btn small" type="button" aria-label={t('models.key.fillAria', { name: providerName(f.id) })} onclick={() => connect(models.getProvider(f.id)!, 'api_key')}>{t('models.key.fill')}</button>
            </li>
          {/each}
        </ul>
        <div class="inline">
          <select class="text" bind:value={keyPick} aria-label={t('models.key.provider')} data-testid="key-provider">
            <option value="" disabled>{t('models.key.other')}</option>
            {#each keyProviders as p (p.id)}<option value={p.id}>{p.name}{freeIds.has(p.id) ? t('models.key.hasFree') : ''}</option>{/each}
          </select>
          <button
            class="btn"
            type="button"
            disabled={!keyPick}
            onclick={() => {
              const p = models.getProvider(keyPick);
              if (p) void connect(p, 'api_key');
            }}>{t('models.key.add')}</button
          >
        </div>
      </div>

      <div class="card">
        <h2 class="display">{t('models.sub.title')}</h2>
        <p class="hint small">{t('models.sub.hint')}</p>
        <ul>
          {#each subscriptions as p (p.id)}
            {@const c = creds[p.id]}
            <li data-testid="subscription">
              <span class="grow">
                {signInName(p)}
                {#if c?.type === 'oauth'}<span class="okword">· {t('models.sub.in')}</span>{/if}
              </span>
              {#if c?.type === 'oauth'}
                <button class="btn small soft" type="button" onclick={() => disconnect(p.id)}>{t('models.sub.logout')}</button>
              {:else}
                <button class="btn small" type="button" onclick={() => connect(p, 'oauth')}>{t('models.sub.login')}</button>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="hint small">{t('models.sub.claude')}</p>
      </div>

      <div class="card">
        <h2 class="display">{t('models.custom.title')}</h2>
        <p class="hint small">{t('models.custom.hint')}</p>
        {#if settings.custom.length}
          <ul>
            {#each settings.custom as c (c.id)}
              <li data-testid="custom">
                <span class="grow url"><b>{c.name}</b> <span class="small hint">{c.baseUrl} · {c.models.join(', ')}</span>
                  {#if creds[c.id]}<span class="okword small">· {t('models.custom.hasKey')}</span>{/if}</span>
                <span class="btns">
                  <button class="btn small" type="button" onclick={() => connect(models.getProvider(c.id)!, 'api_key')}>{creds[c.id] ? t('models.custom.changeKey') : t('models.custom.setKey')}</button>
                  <button class="btn small soft" type="button" onclick={() => removeCustom(c.id)}>{t('common.delete')}</button>
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
          <label class="field">{t('models.custom.name')} <input type="text" placeholder="Ollama" bind:value={form.name} /></label>
          <label class="field">Base URL <input type="text" placeholder="http://localhost:11434/v1" bind:value={form.baseUrl} required data-testid="custom-url" /></label>
          <label class="field">
            {t('models.custom.api')}
            <select bind:value={form.api}>
              <option value="openai-completions">{t('models.custom.openai')}</option>
              <option value="anthropic-messages">{t('models.custom.anthropic')}</option>
            </select>
          </label>
          <label class="field">{t('models.custom.ids')}<input type="text" placeholder="qwen3:8b" bind:value={form.models} required data-testid="custom-models" /></label>
          <div><button class="btn" type="submit">{t('models.custom.add')}</button></div>
        </form>
      </div>
    </div>
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
  .intro {
    max-width: 720px;
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
    font-size: 22px;
  }
  .two,
  .three {
    display: grid;
    gap: 20px;
    align-items: start;
    margin-top: 24px;
  }
  .two {
    grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr));
  }
  .three {
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .card p {
    margin: 0;
  }
  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
  }
  .switch input {
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }
  .lead {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .spark {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    background: var(--pink-soft);
    color: var(--link);
    display: grid;
    place-items: center;
    transform: rotate(-6deg);
  }
  .big {
    font-size: 22px;
  }
  .state {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--paper);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .state.ok {
    background: var(--ok-bg);
    color: var(--ok);
  }
  .state b {
    display: flex;
    align-items: center;
    gap: 6px;
    word-break: break-word;
  }
  .note {
    padding: 22px;
    border-radius: 22px;
    border: 2px dashed var(--dash);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .note p {
    margin: 0;
  }
  .fine {
    font-size: 12px;
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .result {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--paper);
    font-size: 13px;
    word-break: break-word;
  }
  .result.good {
    background: var(--ok-bg);
    color: var(--ok);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--paper);
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .url {
    word-break: break-all;
  }
  .btns {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .okword {
    color: var(--ok);
    font-weight: 700;
    font-size: 12px;
  }
  .inline {
    display: flex;
    gap: 8px;
  }
  .inline select {
    flex: 1;
  }
  form.custom {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: #9a5b00;
  }
  .err {
    color: var(--danger);
  }
</style>
