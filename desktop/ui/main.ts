// The `browser` global has to exist before any shared code runs.
import './shims/install';
import { mount } from 'svelte';
import Overlay from '@/components/Overlay.svelte';
import { initLang } from '@/lib/i18n/core';
import { bubbleStyle, defaultLayout, emojiBubbles, encoreRate, getLayout, setLayout, showWhen } from '@/lib/settings';
import { live } from '@/lib/ui/live.svelte';
import { invoke } from '@tauri-apps/api/core';
import { createCore } from './core';
import { connectCursor } from './cursor';
import { collectHitRects, createHitReporter, watchHitRects, type Rect } from './hitRegions';
import { connectSessions } from './sessions';
import { tauriCursorIo, tauriIo } from './tauri';

/** Layouts are stored per site in the extension; the desktop app has one stage. */
const LAYOUT_KEY = 'desktop';

async function main(): Promise<void> {
  void initLang();
  const core = createCore();

  live.packs = await core.catalog.all();
  const pack = live.packs[0];
  if (!pack) throw new Error('no characters found: /packs/index.json is missing or empty');

  live.bubbles = await emojiBubbles.getValue();
  emojiBubbles.watch((on) => (live.bubbles = on));
  live.bubbleStyle = await bubbleStyle.getValue();
  bubbleStyle.watch((v) => (live.bubbleStyle = v));
  live.encore = await encoreRate.getValue();
  encoreRate.watch((v) => (live.encore = v));
  live.showWhen = await showWhen.getValue();
  showWhen.watch((v) => (live.showWhen = v));

  const layout = (await getLayout(LAYOUT_KEY)) ?? defaultLayout(pack.size, { w: innerWidth, h: innerHeight });
  mount(Overlay, {
    target: document.getElementById('app')!,
    props: {
      layout,
      send: core.send,
      saveLayout: (l) => void setLayout(LAYOUT_KEY, l),
      // No per-app hiding in D1 (it arrives with the settings window): without the callback the button is not drawn.
      hideSite: undefined,
      openPip: undefined,
    },
  });

  // Tell the Rust side where the mouse must reach the page; everywhere else clicks fall through.
  const hits = createHitReporter({
    collect: () => collectHitRects(document),
    send: (rects: Rect[]) => void invoke('set_hit_regions', { rects }).catch((e: unknown) => console.warn('[kobutai] set_hit_regions failed:', e)),
  });
  watchHitRects(hits.update);

  connectCursor(tauriCursorIo);
  connectSessions(core.hub, tauriIo);
}

main().catch((e) => console.error('[kobutai] failed to start', e));
