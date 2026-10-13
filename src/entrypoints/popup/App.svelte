<script lang="ts">
  import { onDestroy } from 'svelte';
  import Character from '@/components/Character.svelte';
  import Icon from '@/components/Icon.svelte';
  import Logo from '@/components/Logo.svelte';
  import { blobKey, getBlob, isBlobRef } from '@/lib/blobstore';
  import { formatTime, livePosition } from '@/lib/format';
  import type { DrawView } from '@/lib/gacha/engine';
  import type { MediaCommand } from '@/lib/media/types';
  import { VIEW_PORT_NAME, type RuntimeRequest, type SiteInfo, type ToBackground, type ToContent } from '@/lib/messages';
  import { PackCatalog } from '@/lib/pack/catalog';
  import type { LoadedPack } from '@/lib/pack/types';
  import type { RegistryState } from '@/lib/registry';
  import { setSrcResolver } from '@/lib/render/renderer';
  import { collection, llmSettings, type CollectionEntry } from '@/lib/settings';
  import { contentKey } from '@/lib/tagging/types';
  import { drawBadge, tagText } from '@/lib/ui/labels';
  import { localName, syncDocumentLang, t } from '@/lib/i18n/ui.svelte';

  syncDocumentLang();

  setSrcResolver(async (src) => {
    if (!isBlobRef(src)) return src;
    const blob = await getBlob(blobKey(src));
    if (!blob) throw new Error(`missing asset ${src}`);
    return URL.createObjectURL(blob);
  });

  // --- This tab: can it show the character, and is it hidden here? ---
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
  void (async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    info = await ask({ t: 'site-info' });
    unavailable = !info;
  })();
  async function toggleSite() {
    if (!info) return;
    info = (await ask({ t: 'set-site-hidden', hidden: !info.hidden })) ?? info;
  }

  // --- What is playing, from the background (same state the overlays get) ---
  let registry = $state<RegistryState>({ primary: null, entries: [] });
  let draw = $state<DrawView | null>(null);
  let connected = $state(false);
  const port = browser.runtime.connect({ name: VIEW_PORT_NAME });
  port.onMessage.addListener((msg: ToContent) => {
    if (msg.t !== 'state') return;
    registry = msg.state;
    draw = msg.draw;
    connected = true;
  });
  const send = (msg: ToBackground) => port.postMessage(msg);
  onDestroy(() => port.disconnect());

  let packs = $state<LoadedPack[]>([]);
  const catalog = new PackCatalog();
  void catalog.all().then((p) => (packs = p));
  catalog.onChange((p) => (packs = p));
  let coll = $state<Record<string, CollectionEntry>>({});
  void collection.getValue().then((v) => (coll = v));
  collection.watch((v) => (coll = v));
  let aiOn = $state(false);
  void llmSettings.getValue().then((s) => (aiOn = s.enabled && !!s.provider));

  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 500);
  onDestroy(() => clearInterval(tick));

  const primary = $derived(registry.primary);
  const snap = $derived(primary?.snapshot ?? null);
  const key = $derived(snap?.title ? contentKey({ site: snap.site, title: snap.title, artist: snap.artist }) : null);
  /** The draw belongs to what is playing now (or a character is locked). */
  const ready = $derived(!!draw && (draw.locked || (!!key && draw.contentKey === key)));
  const pack = $derived(packs.find((p) => p.id === draw?.packId));
  const sleeper = $derived(packs.find((p) => p.id === 'kiki') ?? packs[0]);
  const badge = $derived(ready ? drawBadge(draw) : null);
  const got = $derived(packs.filter((p) => coll[p.id]).length);
  const position = $derived(primary && snap ? livePosition(snap, primary.at, now) : 0);

  function cmd(c: MediaCommand) {
    send({ t: 'command', key: primary?.key, cmd: c });
  }
  function openPage(hash: string) {
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${hash}`) });
    close();
  }
</script>

<main data-testid="popup">
  <header>
    <Logo size={30} />
    <button class="icon-btn" aria-label={t('tabs.settings')} onclick={() => openPage('settings')}><Icon name="settings" /></button>
  </header>

  {#if unavailable && !snap}
    <div class="sheet center" data-testid="popup-unsupported">
      <span class="eye"><Icon name="eyeoff" size={24} /></span>
      <div class="display big">{t('popup.unsupported')}</div>
      <p class="hint">{t('popup.unsupportedHint')}</p>
    </div>
  {:else if snap && primary}
    {#if ready && pack && draw}
      <div class="sheet stage tilt" style:transform="rotate(-1deg)" data-testid="popup-now">
        <div class="photo">
          <div class="fit" style:width="{pack.size.w * 0.56}px" style:height="{pack.size.h * 0.56}px">
            <div class="scale"><Character {pack} mood={snap.playing ? 'playing' : 'paused'} /></div>
          </div>
        </div>
        <div class="who">
          <div class="display name">{localName(pack)}</div>
          <div class="chips">
            {#if draw.locked}
              <span class="chip pink"><Icon name="lock" size={11} stroke={2.6} /> {t('common.locked')}</span>
            {:else}
              <span class="chip pink">{tagText(draw)}</span>
            {/if}
          </div>
          {#if badge?.kind === 'ai'}
            <div class="small hint how"><Icon name="sparkle" size={12} /> {t('popup.aiSaid', { tag: tagText(draw) })}</div>
          {:else if badge?.kind === 'match'}
            <div class="small hint how">{t('popup.matched')}</div>
          {/if}
          {#if coll[pack.id]}<div class="small hint">{t('popup.nth', { n: coll[pack.id]!.n })}</div>{/if}
        </div>
      </div>
    {:else}
      <div class="sheet center tilt" style:transform="rotate(1deg)" data-testid="popup-drawing">
        <div class="pending"><Icon name="sparkle" size={30} /></div>
        <div class="display big">{aiOn ? t('popup.aiListening') : t('popup.drawing')}</div>
        <p class="hint small">{aiOn ? t('popup.aiListeningHint') : t('popup.drawingHint')}</p>
      </div>
    {/if}

    <div class="track">
      <div class="title" title={snap.title}>{snap.title || snap.site}</div>
      <div class="hint small">{snap.artist ? `${snap.artist} · ` : ''}{snap.site}</div>
      <div class="progress">
        <span>{formatTime(position)}</span>
        <input
          type="range"
          aria-label={t('common.progress')}
          min="0"
          max={snap.duration || 0}
          step="0.1"
          value={position}
          disabled={!snap.canSeek}
          onchange={(e) => cmd({ type: 'seek', time: +e.currentTarget.value })}
        />
        <span>{snap.duration ? formatTime(snap.duration) : 'LIVE'}</span>
      </div>
    </div>

    <div class="transport">
      <button class="round" aria-label={t('common.prev')} disabled={!snap.canPrev} onclick={() => cmd({ type: 'prev' })}><Icon name="prev" /></button>
      <button class="round main" aria-label={snap.playing ? t('common.pause') : t('common.play')} data-testid="popup-toggle" onclick={() => cmd({ type: snap.playing ? 'pause' : 'play' })}>
        <Icon name={snap.playing ? 'pause' : 'play'} size={22} stroke={3} />
      </button>
      <button class="round" aria-label={t('common.next')} disabled={!snap.canNext} onclick={() => cmd({ type: 'next' })}><Icon name="next" /></button>
    </div>

    <div class="pair">
      <button
        class="dash"
        disabled={!draw?.canReroll || !ready}
        title={draw?.locked ? t('common.locked') : draw?.canReroll ? t('reroll.can') : t('reroll.used')}
        data-testid="popup-reroll"
        onclick={() => send({ t: 'reroll' })}><Icon name="dice" size={16} /> {t('common.reroll')}</button
      >
      <button class="dash" class:on={draw?.locked} aria-pressed={!!draw?.locked} data-testid="popup-lock" onclick={() => send({ t: 'lock', locked: !draw?.locked })}>
        <Icon name="lock" size={16} />
        {draw?.locked ? t('common.locked') : t('common.lock')}
      </button>
    </div>
  {:else if connected}
    <div class="sheet center tilt" style:transform="rotate(-1deg)" data-testid="popup-idle">
      <div class="zz">(｡-ω-)zzZ</div>
      {#if sleeper}
        <div class="sleep fit" style:width="{sleeper.size.w * 0.58}px" style:height="{sleeper.size.h * 0.58}px">
          <div class="scale small-scale"><Character pack={sleeper} mood="paused" /></div>
        </div>
      {/if}
      <div class="display big">{t('popup.idle')}</div>
      <p class="hint small">{t('popup.idleHint')}</p>
    </div>
    <div class="pair">
      <button class="plain" onclick={() => openPage('import')}><Icon name="download" size={16} /> {t('tabs.import')}</button>
      <button class="plain" onclick={() => openPage('models')}><span class="spark"><Icon name="sparkle" size={15} /></span> {t('tabs.models')}</button>
    </div>
  {/if}

  {#if info}
    <label class="site">
      <span>{t('popup.showOn', { host: info.host })}</span>
      <input type="checkbox" checked={!info.hidden} onchange={toggleSite} data-testid="popup-site" />
    </label>
  {/if}

  <footer>
    <span class="hint">{t('popup.collected')} <b>{got}</b> / {packs.length}</span>
    <button class="link" onclick={() => openPage('collection')}>{t('popup.openCollection')}</button>
  </footer>
</main>

<style>
  :global(body) {
    background-size: 22px 22px;
  }
  main {
    box-sizing: border-box;
    width: 320px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    border: 0;
    background: var(--card);
    color: var(--ink);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .sheet {
    background: var(--card);
    border-radius: 18px;
    padding: 10px;
    box-shadow: var(--shadow-soft);
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    padding: 16px 14px;
  }
  .center p {
    margin: 0;
  }
  .big {
    font-size: 18px;
  }
  .small {
    font-size: 12px;
  }
  .stage {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .photo {
    width: 84px;
    height: 124px;
    border-radius: 14px;
    background: var(--sky-soft);
    display: grid;
    place-items: end center;
    overflow: hidden;
    flex: none;
  }
  /* Characters are drawn on a 208 px tall cell; the popup shows them at about 116 px. */
  .fit {
    position: relative;
    flex: none;
  }
  .scale {
    position: absolute;
    left: 0;
    top: 0;
    transform: scale(0.56);
    transform-origin: 0 0;
    filter: var(--sticker);
  }
  .scale.small-scale {
    transform: scale(0.58);
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .name {
    font-size: 19px;
    line-height: 1.25;
    word-break: break-word;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .chip.pink {
    background: var(--pink-soft);
  }
  .how {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pending {
    width: 84px;
    height: 110px;
    border-radius: 14px;
    border: 2px dashed var(--dash);
    display: grid;
    place-items: center;
    color: var(--link);
  }
  .zz {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--chip);
    font-weight: 500;
  }
  .sleep {
    opacity: 0.6;
    filter: saturate(0.5);
  }
  .eye {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: var(--chip);
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .track {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 700;
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .progress input {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
    margin: 0;
  }
  .transport {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
  }
  .round {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    background: var(--card);
    color: var(--ink);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .round.main {
    width: 52px;
    height: 52px;
    background: var(--ink);
    color: var(--card);
    box-shadow: 0 4px 0 var(--pink);
  }
  .round:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .dash,
  .plain {
    height: 40px;
    border-radius: 14px;
    border: 2px dashed var(--dash);
    background: var(--card);
    color: var(--ink);
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .plain {
    border-style: solid;
    border-color: transparent;
  }
  .dash.on {
    background: var(--ink);
    color: var(--card);
    border-style: solid;
    border-color: var(--ink);
  }
  .dash:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .spark {
    color: var(--link);
    display: inline-flex;
  }
  .site {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 14px;
    background: var(--card);
    cursor: pointer;
  }
  .site span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .site input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    margin: 0;
    flex: none;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
  }
  footer b {
    color: var(--ink);
  }
  .link {
    border: 0;
    background: none;
    color: var(--link);
    font-weight: 700;
    cursor: pointer;
    padding: 4px 0;
  }
</style>
