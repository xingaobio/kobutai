<script lang="ts">
  import type { RuntimeRequest, SiteInfo } from '@/lib/messages';

  let tabId = $state<number | undefined>();
  let info = $state<SiteInfo | null>(null);
  let unavailable = $state(false);

  async function ask(req: RuntimeRequest): Promise<SiteInfo | null> {
    if (tabId === undefined) return null;
    try {
      return (await browser.tabs.sendMessage(tabId, req, { frameId: 0 })) as SiteInfo;
    } catch {
      return null;
    }
  }

  async function load() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    info = await ask({ t: 'site-info' });
    unavailable = !info;
  }

  async function toggle() {
    if (!info) return;
    info = (await ask({ t: 'set-site-hidden', hidden: !info.hidden })) ?? info;
  }

  void load();
</script>

<main>
  <h1>HappyDesk</h1>
  {#if info}
    <p class="host">{info.host}</p>
    <label>
      <input type="checkbox" checked={!info.hidden} onchange={toggle} />
      在此站点显示角色
    </label>
  {:else if unavailable}
    <p class="muted">这个页面不能显示角色（浏览器内置页面或刚安装后未刷新的页面）。</p>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #18181e;
    background: #fff;
  }
  @media (prefers-color-scheme: dark) {
    :global(body) {
      color: #f4f4f6;
      background: #1c1c22;
    }
  }
  main {
    width: 260px;
    padding: 14px 16px;
  }
  h1 {
    font-size: 15px;
    margin: 0 0 8px;
  }
  .host {
    font-weight: 600;
    margin: 0 0 8px;
    word-break: break-all;
  }
  label {
    display: flex;
    gap: 8px;
    align-items: center;
    cursor: pointer;
  }
  .muted {
    opacity: 0.7;
    margin: 0;
  }
</style>
