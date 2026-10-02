<script lang="ts">
  import { onDestroy } from 'svelte';
  import Character from './Character.svelte';
  import ControlBar from './ControlBar.svelte';
  import type { LoadedPack, StateName } from '../lib/pack/types';
  import type { ToBackground } from '../lib/messages';
  import { clampLayout, type Layout } from '../lib/settings';
  import { live } from '../lib/ui/live.svelte';

  let {
    pack,
    layout: initial,
    send,
    saveLayout,
    hideSite,
  }: {
    pack: LoadedPack;
    layout: Layout;
    send: (msg: ToBackground) => void;
    saveLayout: (l: Layout) => void;
    hideSite: () => void;
  } = $props();

  const BAR_W = 300;
  const DRAG_THRESHOLD = 4;

  let view = $state({ w: innerWidth, h: innerHeight });
  // The prop only seeds the layout; from then on the overlay owns it. A layout saved
  // in a bigger window must still land on screen.
  // svelte-ignore state_referenced_locally
  let layout = $state(clampLayout(initial, pack.size, view));
  let hovering = $state(false);
  let barH = $state(150);
  let poke = $state(0);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const box = $derived({ w: pack.size.w * layout.scale, h: pack.size.h * layout.scale });
  const mood = $derived<StateName>(
    live.registry.primary ? (live.registry.primary.snapshot.playing ? 'playing' : 'paused') : 'idle',
  );
  const barPos = $derived.by(() => {
    const left = Math.min(Math.max(8, layout.x + box.w / 2 - BAR_W / 2), view.w - BAR_W - 8);
    const below = layout.y + box.h + 6;
    const top = below + barH < view.h - 4 ? below : Math.max(4, layout.y - barH - 6);
    return { left, top };
  });

  function onResize() {
    view = { w: innerWidth, h: innerHeight };
    layout = clampLayout(layout, pack.size, view);
  }
  addEventListener('resize', onResize);
  onDestroy(() => {
    removeEventListener('resize', onResize);
    clearTimeout(hideTimer);
  });

  $effect(() => {
    if (live.fullscreen) hovering = false;
  });

  function enter() {
    clearTimeout(hideTimer);
    hovering = true;
  }
  function leave() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => (hovering = false), 350);
  }

  /** Pointer gesture helper: drag past a threshold, otherwise treat as a click. */
  function gesture(e: PointerEvent, onMove: (dx: number, dy: number) => void, onClick?: () => void) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      onMove(dx, dy);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (moved) saveLayout($state.snapshot(layout));
      else onClick?.();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function dragStart(e: PointerEvent) {
    const start = { ...layout };
    gesture(
      e,
      (dx, dy) => (layout = clampLayout({ ...start, x: start.x + dx, y: start.y + dy }, pack.size, view)),
      () => poke++,
    );
  }

  function resizeStart(e: PointerEvent) {
    const start = { ...layout };
    const startW = pack.size.w * start.scale;
    gesture(e, (dx, dy) => {
      const scale = (startW + (dx + dy) / 2) / pack.size.w;
      layout = clampLayout({ ...start, scale }, pack.size, view);
    });
  }
</script>

{#if !live.hidden && !live.fullscreen}
  <div
    class="root"
    data-testid="happydesk-overlay"
    style:left="{layout.x}px"
    style:top="{layout.y}px"
    style:width="{box.w}px"
    style:height="{box.h}px"
    role="presentation"
    onpointerenter={enter}
    onpointerleave={leave}
  >
    <div
      class="mascot"
      data-testid="happydesk-mascot"
      data-mood={mood}
      data-pack={pack.id}
      role="button"
      tabindex="-1"
      aria-label={pack.name}
      onpointerdown={dragStart}
    >
      <div class="scaler" style:transform="scale({layout.scale})">
        <Character {pack} {mood} {poke} />
      </div>
    </div>
    {#if hovering}
      <div class="resize" role="presentation" title="拖动缩放" onpointerdown={resizeStart}></div>
    {/if}
  </div>

  {#if hovering}
    <div
      class="bar-wrap"
      style:left="{barPos.left}px"
      style:top="{barPos.top}px"
      role="presentation"
      bind:clientHeight={barH}
      onpointerenter={enter}
      onpointerleave={leave}
    >
      <ControlBar registry={live.registry} {send} onHideSite={hideSite} />
    </div>
  {/if}
{/if}

<style>
  .root,
  .bar-wrap {
    position: fixed;
    z-index: 2147483647;
  }
  .root {
    touch-action: none;
    user-select: none;
  }
  .mascot {
    width: 100%;
    height: 100%;
    cursor: grab;
    outline: none;
  }
  .mascot:active {
    cursor: grabbing;
  }
  .scaler {
    transform-origin: 0 0;
    width: max-content;
  }
  .resize {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: rgba(24, 24, 30, 0.75);
    border: 2px solid #fff;
    cursor: nwse-resize;
    touch-action: none;
  }
</style>
