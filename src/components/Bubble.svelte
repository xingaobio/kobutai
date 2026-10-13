<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import EmojiSprite from './EmojiSprite.svelte';
  import { ENCORE_ACT_CHANCE, EncoreScheduler, encoreBubble } from '../lib/emoji/encore';
  import { bubbleFor, type BubbleContent } from '../lib/emoji/kaomoji';
  import { EVENT_EMOJI, encoreMoods, pickEmoji } from '../lib/emoji/pick';
  import type { EmojiName } from '../lib/emoji/sheets.gen';
  import { contentKey } from '../lib/tagging/types';
  import { live } from '../lib/ui/live.svelte';

  /**
   * A small bubble next to the character (`side`: which side of it the bubble is on) saying what is playing:
   * an animated emoji or a kaomoji (颜文字), per the user's style. A guitar or \m/(≧▽≦)\m/ for rock,
   * a cake for a birthday song… when a new track starts; 😴 on pause, 🥳 on 换一次. During a long play
   * it comes back every few minutes with something new ("encores"), sometimes with the character's action.
   */
  let {
    size = 56,
    side = 'right',
    onact,
  }: {
    size?: number;
    side?: 'right' | 'left';
    /** An encore asks the character to do its action. */
    onact?: () => void;
  } = $props();

  const TRACK_MS = 6000;
  const PAUSE_MS = 4000;
  const REROLL_MS = 3000;
  const ENCORE_MS = 5000;
  const LEAVE_MS = 300;

  let shown = $state<{ content: BubbleContent; leaving: boolean; id: number } | null>(null);
  let seq = 0;
  let timers: ReturnType<typeof setTimeout>[] = [];

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }
  function present(content: BubbleContent, ms: number): BubbleContent {
    clear();
    const id = ++seq;
    shown = { content, leaving: false, id };
    timers.push(
      setTimeout(() => shown?.id === id && (shown = { ...shown, leaving: true }), ms - LEAVE_MS),
      setTimeout(() => shown?.id === id && (shown = null), ms),
    );
    return content;
  }
  /** `seed` keeps the emoji-or-kaomoji choice the same for one track in every tab. */
  function show(name: EmojiName, ms: number, seed = `event|${seq}|${name}`): BubbleContent {
    return present(bubbleFor(name, live.bubbleStyle, seed), ms);
  }

  /** What this track's bubbles said last, so an encore always says something else. */
  let lastSaid: BubbleContent | null = null;
  const encores = new EncoreScheduler(() => {
    const snap = live.registry.primary?.snapshot;
    if (!snap?.title) return;
    const draw = live.draw;
    if (live.bubbles) {
      const forThis = draw?.contentKey === contentKey({ site: snap.site, title: snap.title, artist: snap.artist });
      lastSaid = present(encoreBubble(encoreMoods(snap, forThis ? draw.tags : null), live.bubbleStyle, Math.random, lastSaid), ENCORE_MS);
    }
    // With bubbles switched off the action is all an encore can do.
    if (!live.bubbles || Math.random() < ENCORE_ACT_CHANCE) onact?.();
  });
  onDestroy(() => {
    clear();
    encores.stop();
  });

  // What the last update looked like, to spot a new track, a pause and a reroll.
  let shownKey: string | null = null;
  let lastPack = '';
  let lastCanReroll = false;
  let wasPlaying = false;

  $effect(() => {
    const snap = live.registry.primary?.snapshot ?? null;
    const draw = live.draw;
    const enabled = live.bubbles;
    const rate = live.encore;
    untrack(() => {
      const playing = !!snap?.playing;
      const key = snap?.title ? contentKey({ site: snap.site, title: snap.title, artist: snap.artist }) : null;
      if (!enabled) {
        clear();
        shown = null;
      } else if (snap && key && draw) {
        const forThis = draw.contentKey === key;
        if (playing && key !== shownKey && (forThis || draw.locked)) {
          // The draw for the new track has arrived (or the character is locked): say what it is.
          shownKey = key;
          lastPack = draw.packId;
          lastSaid = show(pickEmoji(snap, forThis ? draw.tags : null), TRACK_MS, key);
        } else if (forThis && draw.packId !== lastPack) {
          if (lastCanReroll && !draw.canReroll && !draw.locked) show(EVENT_EMOJI.reroll, REROLL_MS);
          lastPack = draw.packId;
        }
        if (wasPlaying && !playing) show(EVENT_EMOJI.pause, PAUSE_MS);
      }
      lastCanReroll = !!draw && draw.contentKey === key && draw.canReroll;
      wasPlaying = playing;
      // Encores count playing time of the current content only, bubbles on or off.
      encores.update({ key, playing, rate });
    });
  });
</script>

{#if shown}
  {@const content = shown.content}
  <div
    class="bubble"
    class:leaving={shown.leaving}
    class:on-left={side === 'left'}
    class:text={content.kind === 'kaomoji'}
    style:--size="{size}px"
    data-testid="happydesk-bubble"
    data-kind={content.kind}
    data-emoji={content.name}
    data-kaomoji={content.kind === 'kaomoji' ? content.text : undefined}
  >
    {#key shown.id}
      {#if content.kind === 'emoji'}
        <EmojiSprite name={content.name} size={Math.round(size * 0.78)} />
      {:else}
        <span class="kaomoji">{content.text}</span>
      {/if}
    {/key}
  </div>
{/if}

<style>
  .bubble {
    position: relative;
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid #e9d5df;
    box-shadow: 0 4px 12px rgba(58, 39, 72, 0.1);
    pointer-events: none;
    transform-origin: 20% 100%;
    animation: pop 0.28s cubic-bezier(0.3, 1.6, 0.6, 1) both;
  }
  /* The little tail that makes it read as the character's speech bubble. */
  .bubble::after {
    content: '';
    position: absolute;
    left: 14%;
    bottom: -4px;
    width: 12px;
    height: 12px;
    background: inherit;
    border-right: 1px solid #e9d5df;
    border-bottom: 1px solid #e9d5df;
    border-radius: 2px;
    transform: rotate(45deg);
    z-index: -1;
  }
  /* Kaomoji: a pill as wide as its text. */
  .bubble.text {
    width: auto;
    height: calc(var(--size) * 0.62);
    padding: 0 calc(var(--size) * 0.22);
    border-radius: 999px;
  }
  .kaomoji {
    font: 500 calc(var(--size) * 0.27) / 1 system-ui, 'Hiragino Sans', 'Yu Gothic UI', 'Microsoft YaHei', sans-serif;
    color: #3a2748;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }
  /* On the character's left the tail points right, back at the character. */
  .bubble.on-left {
    transform-origin: 80% 100%;
  }
  .bubble.on-left::after {
    left: auto;
    right: 14%;
  }
  .bubble.leaving {
    animation: fade 0.3s ease forwards;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes fade {
    to {
      opacity: 0;
      transform: scale(0.85) translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bubble,
    .bubble.leaving {
      animation: none;
    }
  }
</style>
