<script lang="ts">
  import { onDestroy } from 'svelte';
  import { formatTime, livePosition } from '../lib/format';
  import type { MediaCommand } from '../lib/media/types';
  import type { ToBackground } from '../lib/messages';
  import type { DrawView } from '../lib/gacha/engine';
  import type { RegistryState } from '../lib/registry';

  let {
    registry,
    draw,
    packName,
    send,
    onHideSite,
  }: {
    registry: RegistryState;
    draw: DrawView | null;
    packName: string;
    send: (msg: ToBackground) => void;
    onHideSite: () => void;
  } = $props();

  const GENRE_LABEL: Record<string, string> = {
    jpop: 'J-Pop', anime: '动漫', 'western-pop': '欧美流行', hiphop: '说唱', rock: '摇滚',
    electronic: '电子', classical: '古典', lofi: 'Lo-fi', cpop: '华语', other: '其他音乐',
  };
  const TYPE_LABEL: Record<string, string> = { music: '音乐', video: '视频', live: '直播', podcast: '播客', other: '其他' };
  const tagLabel = $derived(
    draw && !draw.locked ? (draw.tags.genre ? GENRE_LABEL[draw.tags.genre] : TYPE_LABEL[draw.tags.type]) + (draw.tags.source === 'rules' ? '' : ' · AI') : '',
  );

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
      <button class="icon" aria-label="上一首" disabled={!snap.canPrev} onclick={() => cmd({ type: 'prev' })}>
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12 18 6v12z" /></svg>
      </button>
      <button
        class="icon play"
        aria-label={snap.playing ? '暂停' : '播放'}
        data-testid="happydesk-toggle"
        onclick={() => cmd({ type: snap.playing ? 'pause' : 'play' })}
      >
        {#if snap.playing}
          <svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
        {:else}
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        {/if}
      </button>
      <button class="icon" aria-label="下一首" disabled={!snap.canNext} onclick={() => cmd({ type: 'next' })}>
        <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18V6l8.5 6z" /></svg>
      </button>
    </div>

    <div class="progress">
      <span>{formatTime(position)}</span>
      <input
        type="range"
        aria-label="进度"
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

    <div class="row">
      <button
        class="icon small"
        aria-label={snap.muted ? '取消静音' : '静音'}
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
        aria-label="音量"
        min="0"
        max="1"
        step="0.01"
        value={snap.muted ? 0 : snap.volume}
        oninput={(e) => cmd({ type: 'volume', volume: +e.currentTarget.value })}
      />
      <button class="icon small" aria-label="在此站点隐藏" title="在此站点隐藏" onclick={onHideSite}>
        <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" fill="none" /><path d="M4 20 20 4" stroke="currentColor" stroke-width="2" /></svg>
      </button>
    </div>

    <div class="gacha" data-testid="happydesk-gacha">
      <span class="who" title={packName}>{packName}{#if tagLabel}<em>{tagLabel}</em>{/if}</span>
      <button
        class="chip"
        data-testid="happydesk-reroll"
        disabled={!draw?.canReroll}
        title={draw?.locked ? '已锁定' : draw?.canReroll ? '换一个角色（每首只能换一次）' : '这首已经换过了'}
        onclick={() => send({ t: 'reroll' })}>🎲 换一次</button
      >
      <button
        class="chip"
        class:on={draw?.locked}
        data-testid="happydesk-lock"
        aria-pressed={!!draw?.locked}
        title={draw?.locked ? '解锁，恢复自动抽卡' : '锁定当前角色，不再自动抽卡'}
        onclick={() => send({ t: 'lock', locked: !draw?.locked })}>{draw?.locked ? '🔒 已锁定' : '🔓 锁定'}</button
      >
    </div>

    {#if registry.entries.length > 1}
      <select
        aria-label="切换媒体来源"
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
      <span>没有正在播放的媒体</span>
      <button class="icon small" aria-label="在此站点隐藏" title="在此站点隐藏" onclick={onHideSite}>
        <svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="2" fill="none" /><path d="M4 20 20 4" stroke="currentColor" stroke-width="2" /></svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .bar {
    box-sizing: border-box;
    width: 300px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(24, 24, 30, 0.88);
    backdrop-filter: blur(12px);
    color: #f4f4f6;
    font: 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 8px;
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
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .buttons {
    display: flex;
    justify-content: center;
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
    opacity: 0.85;
  }
  .progress span {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
    min-width: 34px;
    text-align: center;
  }
  input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: #ff8fc7;
    margin: 0;
  }
  .icon {
    all: unset;
    cursor: pointer;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: inherit;
  }
  .icon svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  .icon.small {
    width: 22px;
    height: 22px;
  }
  .icon.small svg {
    width: 16px;
    height: 16px;
  }
  .icon.play {
    background: #f4f4f6;
    color: #18181e;
    width: 34px;
    height: 34px;
  }
  .icon:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }
  .icon.play:hover {
    background: #fff;
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .icon:focus-visible {
    outline: 2px solid #ff8fc7;
  }
  .gacha {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  .who {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }
  .who em {
    font-style: normal;
    font-weight: 400;
    opacity: 0.65;
    margin-left: 6px;
  }
  .chip {
    all: unset;
    cursor: pointer;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    white-space: nowrap;
  }
  .chip:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.22);
  }
  .chip:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .chip.on {
    background: #ff8fc7;
    color: #18181e;
  }
  .chip:focus-visible {
    outline: 2px solid #ff8fc7;
  }
  select {
    width: 100%;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 4px 6px;
    font: inherit;
  }
  option {
    color: #18181e;
  }
</style>
