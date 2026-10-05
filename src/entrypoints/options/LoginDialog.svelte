<script lang="ts">
  import type { AuthEvent, AuthInteraction, AuthPrompt, AuthType, Models } from '@earendil-works/pi-ai';
  import { onDestroy, onMount } from 'svelte';
  import { deliverLoopback, isLoopbackPending } from '@/lib/llm/shims/node-http';

  let {
    models,
    providerId,
    type,
    title,
    deviceId,
    ondone,
  }: {
    models: Models;
    providerId: string;
    type: AuthType;
    title: string;
    deviceId: string;
    ondone: (ok: boolean) => void;
  } = $props();

  interface Pending {
    p: AuthPrompt;
    resolve: (v: string) => void;
    reject: (e: Error) => void;
  }
  let pending = $state.raw<Pending | null>(null);
  let value = $state('');
  let notes = $state<{ text: string; links?: readonly { url: string; label?: string }[] }[]>([]);
  let authUrl = $state<string | null>(null);
  let device = $state<{ code: string; uri: string } | null>(null);
  let error = $state<string | null>(null);
  let copied = $state(false);
  const ac = new AbortController();

  const OPTION_LABELS: Record<string, string> = {
    browser: '浏览器登录（推荐）',
    device_code: '设备码登录',
    copy_code: '复制授权码登录',
  };

  const open = (url: string) => void browser.tabs.create({ url });

  // Browser sign-ins end on a localhost redirect nothing listens on. Catch that
  // URL (we hold host access to localhost) and finish the login here.
  const onUpdated = (tabId: number, info: { url?: string }) => {
    if (!info.url) return;
    let url: URL;
    try {
      url = new URL(info.url);
    } catch {
      return;
    }
    if (!isLoopbackPending(url)) return;
    void deliverLoopback(url).then(async (status) => {
      if (status !== 200) return;
      await browser.tabs.remove(tabId).catch(() => {});
      const self = await browser.tabs.getCurrent();
      if (self?.id !== undefined) await browser.tabs.update(self.id, { active: true });
    });
  };
  browser.tabs.onUpdated.addListener(onUpdated);
  onDestroy(() => {
    browser.tabs.onUpdated.removeListener(onUpdated);
    ac.abort();
  });

  const interaction: AuthInteraction = {
    signal: ac.signal,
    prompt: (p) =>
      new Promise<string>((resolve, reject) => {
        const entry: Pending = { p, resolve, reject };
        pending = entry;
        value = '';
        p.signal?.addEventListener(
          'abort',
          () => {
            if (pending === entry) pending = null;
            reject(new Error('cancelled'));
          },
          { once: true },
        );
      }),
    notify: (e: AuthEvent) => {
      if (e.type === 'auth_url') {
        authUrl = e.url;
        open(e.url);
      } else if (e.type === 'device_code') {
        device = { code: e.userCode, uri: e.verificationUri };
        open(e.verificationUri);
      } else {
        notes.push({ text: e.message, links: e.type === 'info' ? e.links : undefined });
      }
    },
  };

  onMount(() => {
    models
      .login(providerId, type, interaction, { getDeviceId: () => deviceId })
      .then(() => ondone(true))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        pending = null;
        error = e instanceof Error ? e.message : String(e);
      });
  });

  function submit(v: string) {
    const entry = pending;
    if (!entry) return;
    pending = null;
    entry.resolve(v);
  }

  function cancel() {
    ac.abort();
    pending?.reject(new Error('cancelled'));
    ondone(false);
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    copied = true;
  }
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title} data-testid="login-dialog">
    <h3>连接 {title}</h3>

    {#if device}
      <p>在打开的页面里输入这个代码：</p>
      <p class="code">
        <code data-testid="device-code">{device.code}</code>
        <button type="button" onclick={() => copy(device!.code)}>{copied ? '已复制' : '复制'}</button>
      </p>
      <p class="hint">页面没打开？<a href={device.uri} target="_blank" rel="noreferrer">{device.uri}</a></p>
    {/if}

    {#if authUrl}
      <p class="hint">
        已在新标签页打开登录页面，登录完成后这里会自动继续。
        <a href={authUrl} target="_blank" rel="noreferrer">没打开？点这里</a>
      </p>
    {/if}

    {#each notes as n, i (i)}
      <p class="note">
        {n.text}
        {#each n.links ?? [] as l (l.url)}
          <a href={l.url} target="_blank" rel="noreferrer">{l.label ?? l.url}</a>
        {/each}
      </p>
    {/each}

    {#if pending}
      {@const p = pending.p}
      {#if p.type === 'select'}
        <p>{p.message}</p>
        <div class="options">
          {#each p.options as o (o.id)}
            <button type="button" onclick={() => submit(o.id)}>{OPTION_LABELS[o.id] ?? o.label}</button>
          {/each}
        </div>
      {:else}
        <form
          onsubmit={(e) => {
            e.preventDefault();
            submit(value.trim());
          }}
        >
          <label>
            {p.type === 'manual_code' ? '如果没有自动继续，把登录后浏览器地址栏里的网址（或页面显示的授权码）粘贴到这里：' : p.message}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type={p.type === 'secret' ? 'password' : 'text'}
              placeholder={p.placeholder}
              autocomplete="off"
              autofocus={p.type !== 'manual_code'}
              bind:value
              data-testid="login-input"
            />
          </label>
          <button class="primary" type="submit">确定</button>
        </form>
      {/if}
    {:else if !error}
      <p class="hint">请稍候…</p>
    {/if}

    {#if error}<p class="err" data-testid="login-error">连接失败：{error}</p>{/if}

    <div class="actions">
      <button type="button" onclick={cancel}>{error ? '关闭' : '取消'}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.35);
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 10;
  }
  .dialog {
    background: var(--card);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 20px 22px;
    width: min(480px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.2);
  }
  h3 {
    margin: 0 0 12px;
    font-size: 17px;
  }
  p {
    margin: 0 0 10px;
  }
  .hint,
  .note {
    color: var(--muted);
    font-size: 13px;
    word-break: break-word;
  }
  .code {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .code code {
    font-size: 22px;
    letter-spacing: 2px;
    padding: 6px 12px;
    border-radius: 8px;
    background: var(--bg);
    border: 1px solid var(--line);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--muted);
  }
  input {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    font: inherit;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }
  button {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--text);
    border-radius: 8px;
    padding: 6px 14px;
    cursor: pointer;
    font: inherit;
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    align-self: flex-start;
  }
  .err {
    color: #c0392b;
    word-break: break-word;
  }
</style>
