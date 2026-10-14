<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import Bubble from './Bubble.svelte';
  import Character from './Character.svelte';
  import ControlBar from './ControlBar.svelte';
  import { localName, t } from '../lib/i18n/ui.svelte';
  import type { StateName } from '../lib/pack/types';
  import type { ToBackground } from '../lib/messages';
  import { fitLayout, type Layout } from '../lib/settings';
  import { currentPack, live } from '../lib/ui/live.svelte';
  import { presence } from '../lib/ui/presence';
  import { contentKey } from '../lib/tagging/types';

  let {
    layout: initial,
    send,
    saveLayout,
    hideSite,
    openPip,
  }: {
    layout: Layout;
    send: (msg: ToBackground) => void;
    saveLayout: (l: Layout) => void;
    /** Absent: no "hide on this site" button (the desktop app has no per-app hiding yet). */
    hideSite?: () => void;
    openPip?: () => void;
  } = $props();

  // The content script only mounts once packs are loaded, so there is always one.
  const pack = $derived(currentPack()!);

  const BAR_W = 300;
  const DRAG_THRESHOLD = 4;

  let view = $state({ w: innerWidth, h: innerHeight });
  // The prop only seeds the layout; from then on the overlay owns it. A layout saved
  // in a bigger window must still land on screen.
  // svelte-ignore state_referenced_locally
  let layout = $state(fitLayout(initial, pack.size, view));
  let hovering = $state(false);
  let barH = $state(150);
  let poke = $state(0);
  let act = $state(0);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const box = $derived({ w: pack.size.w * layout.scale, h: pack.size.h * layout.scale });
  // The emoji bubble sits at the character's top-right corner, overlapping it a little
  // (most sheets leave empty space above the head); it flips to the left at the
  // screen's right edge and stays inside the screen at the top edge.
  // A kaomoji bubble is wider than an emoji one, so the real width decides the side,
  // and on the left the bubble is anchored by its right edge.
  let bubbleW = $state(0);
  const bubble = $derived.by(() => {
    const size = Math.round(Math.min(72, Math.max(40, box.w * 0.42)));
    const w = Math.max(bubbleW, size);
    const right = layout.x + box.w - size * 0.3 + w <= view.w;
    return {
      size,
      side: (right ? 'right' : 'left') as 'right' | 'left',
      left: right ? box.w - size * 0.3 : undefined,
      right: right ? undefined : box.w - size * 0.3,
      top: Math.max(-layout.y, -size * 0.35),
    };
  });
  // Like Chrome's media button: on screen while something plays with sound (in any
  // tab), and for a few minutes after it stops; otherwise out of the way.
  let tick = $state(0);
  const shown = $derived.by(() => {
    void tick; // re-check when the grace period runs out
    return presence(live.registry, Date.now(), live.showWhen);
  });
  // Wait for the first draw instead of flashing the first pack in the list and then
  // switching (with several characters per pool that flash is a different character).
  const present = $derived(shown.show && (!!live.draw || live.showWhen === 'always'));
  /** The character on screen is the draw for what is playing now (not the previous content's). */
  const drawnForNow = $derived.by(() => {
    const snap = live.registry.primary?.snapshot;
    const draw = live.draw;
    if (!draw || !snap?.title) return false;
    return draw.locked || draw.contentKey === contentKey({ site: snap.site, title: snap.title, artist: snap.artist });
  });
  $effect(() => {
    const until = shown.until;
    if (until === null) return;
    const timer = setTimeout(() => tick++, Math.max(0, until - Date.now()) + 50);
    return () => clearTimeout(timer);
  });
  const mood = $derived<StateName>(
    live.registry.primary ? (live.registry.primary.snapshot.playing ? 'playing' : 'paused') : 'idle',
  );
  const barPos = $derived.by(() => {
    const left = Math.min(Math.max(8, layout.x + box.w / 2 - BAR_W / 2), view.w - BAR_W - 8);
    const below = layout.y + box.h + 6;
    const top = below + barH < view.h - 4 ? below : Math.max(4, layout.y - barH - 6);
    return { left, top };
  });

  // Another character was drawn: keep its bottom-right corner where the last one's was.
  $effect(() => {
    const { w, h } = pack.size;
    untrack(() => {
      if (layout.w !== w || layout.h !== h) layout = fitLayout(layout, { w, h }, view);
    });
  });

  function onResize() {
    view = { w: innerWidth, h: innerHeight };
    layout = fitLayout(layout, pack.size, view);
  }
  addEventListener('resize', onResize);
  onDestroy(() => {
    removeEventListener('resize', onResize);
    clearTimeout(hideTimer);
  });

  $effect(() => {
    if (live.fullscreen || live.pip) hovering = false;
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
      (dx, dy) => (layout = fitLayout({ ...start, x: start.x + dx, y: start.y + dy }, pack.size, view)),
      () => poke++,
    );
  }

  function resizeStart(e: PointerEvent) {
    const start = { ...layout };
    const startW = pack.size.w * start.scale;
    gesture(e, (dx, dy) => {
      const scale = (startW + (dx + dy) / 2) / pack.size.w;
      layout = fitLayout({ ...start, scale }, pack.size, view);
    });
  }
</script>

{#if present && !live.hidden && !live.fullscreen && !live.pip}
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
      data-drawn={drawnForNow}
      role="button"
      tabindex="-1"
      aria-label={localName(pack)}
      onpointerdown={dragStart}
    >
      <div class="scaler" style:transform="scale({layout.scale})">
        <Character {pack} {mood} {poke} {act} />
      </div>
    </div>
    <div
      class="bubble-slot"
      style:left={bubble.left === undefined ? undefined : `${bubble.left}px`}
      style:right={bubble.right === undefined ? undefined : `${bubble.right}px`}
      style:top="{bubble.top}px"
      bind:clientWidth={bubbleW}
    >
      <Bubble size={bubble.size} side={bubble.side} onact={() => act++} />
    </div>
    {#if hovering}
      <div class="resize" role="presentation" title={t('overlay.resize')} onpointerdown={resizeStart}></div>
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
      <ControlBar
        registry={live.registry}
        draw={live.draw}
        packName={localName(pack)}
        {send}
        onHideSite={hideSite}
        onPip={openPip}
      />
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
  .bubble-slot {
    position: absolute;
    width: max-content;
    pointer-events: none;
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
