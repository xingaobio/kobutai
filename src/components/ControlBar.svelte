<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatTime, livePosition } from '../lib/format';
  import type { MediaCommand } from '../lib/media/types';
  import type { ToBackground } from '../lib/messages';
  import type { DrawView } from '../lib/gacha/engine';
  import type { RegistryState } from '../lib/registry';
  import { drawBadge } from '../lib/ui/labels';
  import { t } from '../lib/i18n/ui.svelte';

  let {
    registry,
    draw,
    packName,
    send,
    onHideSite,
    onPip,
  }: {
    registry: RegistryState;
    draw: DrawView | null;
    packName: string;
    send: (msg: ToBackground) => void;
    /** Absent inside the PiP window. */
    onHideSite?: () => void;
    /** Present only where Document Picture-in-Picture is supported. */
    onPip?: () => void;
  } = $props();

  // How this character was chosen: "AI · 摇滚", "按标题匹配", plain "摇滚" or "锁定".
  const badge = $derived(drawBadge(draw));

  let now = $state(Date.now());
  const tick = setInterval(() => (now = Date.now()), 500);
  onDestroy(() => clearInterval(tick));

  /** While the user drags the progress bar, show their value instead of the live one. */
  let scrubbing = $state<number | null>(null);

  const primary = $derived(registry.primary);
  const snap = $derived(primary?.snapshot);
  const position = $derived(scrubbing ?? (primary && snap ? livePosition(snap, primary.at, now) : 0));

  function cmd(c: MediaCommand) {
    send({ t: 'command', key: primary?.key, cmd: c });
  }

  function label(e: RegistryState['entries'][number]) {
    const t = e.snapshot.title || e.snapshot.site;
    return `${e.snapshot.playing ? '▶ ' : ''}${e.snapshot.site} · ${t}`.slice(0, 80);
  }
</script>

<div class="bar" data-testid="happydesk-controls">
  {#if snap && primary}
    <div class="meta">
      {#if snap.artwork}<img class="art" src={snap.artwork} alt="" referrerpolicy="no-referrer" />{/if}
      <div class="text">
        <div class="title" title={snap.title}>{snap.title}</div>
        {#if snap.artist}<div class="artist" title={snap.artist}>{snap.artist}</div>{/if}
      </div>
    </div>

    <div class="buttons">
      <button class="icon" aria-label={t('common.prev')} disabled={!snap.canPrev} onclick={() => cmd({ type: 'prev' })}>
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12 18 6v12z" /></svg>
      </button>
      <button
        class="icon play"
        aria-label={snap.playing ? t('common.pause') : t('common.play')}
        data-testid="happydesk-toggle"
        onclick={() => cmd({ type: snap.playing ? 'pause' : 'play' })}
      >
        {#if snap.playing}
          <svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
        {:else}
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        {/if}
      </button>
      <button class="icon" aria-label={t('common.next')} disabled={!snap.canNext} onclick={() => cmd({ type: 'next' })}>
        <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18V6l8.5 6z" /></svg>
      </button>
    </div>

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
        oninput={(e) => (scrubbing = +e.currentTarget.value)}
        onchange={(e) => {
          cmd({ type: 'seek', time: +e.currentTarget.value });
          scrubbing = null;
        }}
      />
      <span>{snap.duration ? formatTime(snap.duration) : 'LIVE'}</span>
    </div>

    {#if snap.canVolume !== false || onPip || onHideSite}
    <div class="row">
      {#if snap.canVolume !== false}
        <button
          class="icon small"
          aria-label={snap.muted ? t('common.unmute') : t('common.mute')}
          onclick={() => cmd({ type: 'mute', muted: !snap.muted })}
        >
          {#if snap.muted || snap.volume === 0}
            <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          {:else}
            <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 8a5 5 0 0 1 0 8" stroke="currentColor" stroke-width="2" fill="none" /></svg>
          {/if}
        </button>
        <input
          class="volume"
          type="range"
          aria-label={t('common.volume')}
          min="0"
          max="1"
          step="0.01"
          value={snap.muted ? 0 : snap.volume}
          oninput={(e) => cmd({ type: 'volume', volume: +e.currentTarget.value })}
        />
      {/if}
      {#if onPip}
        <button class="icon small" aria-label={t('bar.pip')} title={t('bar.pipTitle')} data-testid="happydesk-pip-open" onclick={onPip}>
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none" /><rect x="12" y="11" width="7" height="6" rx="1" /></svg>
        </button>
      {/if}
      {#if onHideSite}
        <button class="icon small" aria-label={t('bar.hideSite')} title={t('bar.hideSite')} onclick={onHideSite}>
          <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" fill="none" /><path d="M4 20 20 4" stroke="currentColor" stroke-width="2" /></svg>
        </button>
      {/if}
    </div>
    {/if}

    <div class="gacha" data-testid="happydesk-gacha">
      <span class="who" title={packName}>{packName}</span>
      {#if badge}<span class="badge {badge.kind}" data-testid="happydesk-badge">{#if badge.kind === 'ai'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 5.6L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.4z" /></svg>{/if}{badge.text}</span>{/if}
      <button
        class="chip"
        data-testid="happydesk-reroll"
        disabled={!draw?.canReroll}
        title={draw?.locked ? t('common.locked') : draw?.canReroll ? t('reroll.can') : t('reroll.used')}
        onclick={() => send({ t: 'reroll' })}>{t('common.reroll')}</button
      >
      <button
        class="chip"
        class:on={draw?.locked}
        data-testid="happydesk-lock"
        aria-pressed={!!draw?.locked}
        title={draw?.locked ? t('lock.on') : t('lock.off')}
        onclick={() => send({ t: 'lock', locked: !draw?.locked })}>{draw?.locked ? t('common.locked') : t('common.lock')}</button
      >
    </div>

    {#if registry.entries.length > 1}
      <select
        aria-label={t('bar.source')}
        value={primary.key}
        onchange={(e) => send({ t: 'select', key: e.currentTarget.value })}
      >
        {#each registry.entries as e (e.key)}
          <option value={e.key}>{label(e)}</option>
        {/each}
      </select>
    {/if}
  {:else}
    <div class="empty">
      <span>{t('bar.nothing')}</span>
      {#if onPip}
        <button class="icon small" aria-label={t('bar.pip')} title={t('bar.pipTitle')} data-testid="happydesk-pip-open" onclick={onPip}>
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none" /><rect x="12" y="11" width="7" height="6" rx="1" /></svg>
        </button>
      {/if}
      {#if onHideSite}
        <button class="icon small" aria-label={t('bar.hideSite')} title={t('bar.hideSite')} onclick={onHideSite}>
          <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" fill="none" /><path d="M4 20 20 4" stroke="currentColor" stroke-width="2" /></svg>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Sits on top of other people's pages: plain white card, one accent, nothing loud. */
  .bar {
    box-sizing: border-box;
    width: 300px;
    padding: 12px 14px;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid #e9d5df;
    color: #3a2748;
    font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans', 'Microsoft YaHei', sans-serif;
    box-shadow: 0 1px 2px rgba(58, 39, 72, 0.06), 0 12px 32px rgba(58, 39, 72, 0.14);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .meta {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }
  .art {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    flex: none;
  }
  .text {
    min-width: 0;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .artist {
    color: #6e5a7c;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .buttons {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 14px;
  }
  .row,
  .progress,
  .empty {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .empty {
    justify-content: space-between;
    color: #6e5a7c;
  }
  .progress span {
    font-variant-numeric: tabular-nums;
    color: #6e5a7c;
    min-width: 34px;
    text-align: center;
    font-size: 11px;
  }
  input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: #e0559b;
    margin: 0;
  }
  .row input[type='range'] {
    accent-color: #3a2748;
  }
  .row {
    color: #6e5a7c;
  }
  .icon {
    all: unset;
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: #3a2748;
  }
  .icon svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
  }
  .icon.small {
    width: 28px;
    height: 28px;
  }
  .icon.small svg {
    width: 16px;
    height: 16px;
  }
  .icon.play {
    background: #3a2748;
    color: #ffffff;
    width: 38px;
    height: 38px;
    border-radius: 50%;
  }
  .icon:hover:not(:disabled) {
    background: #fbe9f1;
  }
  .icon.play:hover {
    background: #52395f;
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .icon:focus-visible,
  .chip:focus-visible {
    outline: 2px solid #e0559b;
    outline-offset: 1px;
  }
  .gacha {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 9px;
    border-top: 1px solid #f1e3ea;
  }
  .who {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 999px;
    background: #f3edf7;
    color: #6e5a7c;
    font-size: 11px;
    white-space: nowrap;
    margin-right: auto;
  }
  .badge.ai,
  .badge.match {
    background: #ffd3e5;
    color: #7e0f40;
  }
  .badge svg {
    width: 11px;
    height: 11px;
    fill: currentColor;
  }
  .chip {
    all: unset;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid #e9d5df;
    white-space: nowrap;
    flex: none;
  }
  .chip:hover:not(:disabled) {
    background: #fbe9f1;
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .chip.on {
    background: #3a2748;
    border-color: #3a2748;
    color: #ffffff;
  }
  select {
    width: 100%;
    background: #ffffff;
    color: inherit;
    border: 1px solid #e9d5df;
    border-radius: 8px;
    padding: 4px 6px;
    font: inherit;
  }
</style>
