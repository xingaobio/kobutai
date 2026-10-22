<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import EmojiSprite from './EmojiSprite.svelte';
  import { ENCORE_ACT_CHANCE, EncoreScheduler, encoreBubble } from '../lib/emoji/encore';
  import { bubbleFor, type BubbleContent } from '../lib/emoji/kaomoji';
  import { EVENT_EMOJI, encoreMoods, pickEmoji } from '../lib/emoji/pick';
  import type { EmojiName } from '../lib/emoji/sheets.gen';
  import { LONG_PLAY_MS, RESUME_AFTER_MS, Talker, lineMs, moodOf, type LineEvent } from '../lib/dialogue/dialogue';
  import type { DrawView } from '../lib/gacha/engine';
  import { i18n } from '../lib/i18n/ui.svelte';
  import { contentKey } from '../lib/tagging/types';
  import { currentPack, live } from '../lib/ui/live.svelte';

  /**
   * A small bubble next to the character (`side`: which side of it the bubble is on) saying what is playing:
   * an animated emoji or a kaomoji (颜文字), per the user's style. A guitar or \m/(≧▽≦)\m/ for rock,
   * a cake for a birthday song… when a new track starts; 😴 on pause, 🥳 on 换一次. During a long play
   * it comes back every few minutes with something new ("encores"), sometimes with the character's action.
   * Built-in characters also say lines (台词, lib/dialogue) in their own voice, at most every few minutes
   * (the user's setting); while they wait the bubble is an emoji or kaomoji as before. A tap always gets a line.
   */
  let {
    size = 56,
    side = 'right',
    poke = 0,
    onact,
  }: {
    size?: number;
    side?: 'right' | 'left';
    /** Goes up on every tap of the character. */
    poke?: number;
    /** An encore asks the character to do its action. */
    onact?: () => void;
  } = $props();

  const TRACK_MS = 6000;
  const PAUSE_MS = 4000;
  const REROLL_MS = 3000;
  const ENCORE_MS = 5000;
  const LEAVE_MS = 300;
  /** Share of the encores that are a line (when the cooldown allows one). */
  const LINE_ENCORE_SHARE = 0.5;

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

  const talker = new Talker();
  /**
   * The character on screen says a line for `event`, if it has one and may talk now;
   * `name` is the emoji the line stands in for. Null: show the emoji or kaomoji instead.
   */
  function say(event: LineEvent, name: EmojiName, tags?: DrawView['tags'] | null): BubbleContent | null {
    const pack = currentPack();
    if (!pack) return null;
    const text = talker.say(event, { speaker: pack, lang: i18n.lang, rate: live.talk, mood: moodOf(tags) });
    return text ? present({ kind: 'line', name, text }, lineMs(text)) : null;
  }

  /** What this track's bubbles said last, so an encore always says something else. */
  let lastSaid: BubbleContent | null = null;
  /** Playing time of this content at its last "you've been at it a while" line. */
  let longSaidAt = 0;
  const encores = new EncoreScheduler(() => {
    const snap = live.registry.primary?.snapshot;
    if (!snap?.title) return;
    const draw = live.draw;
    if (live.bubbles) {
      const forThis = draw?.contentKey === contentKey({ site: snap.site, title: snap.title, artist: snap.artist });
      const tags = forThis ? draw.tags : null;
      const name = pickEmoji(snap, tags);
      const played = encores.played();
      let said: BubbleContent | null = null;
      if (played - longSaidAt >= LONG_PLAY_MS && (said = say('long_play', name, tags))) longSaidAt = played;
      if (!said && Math.random() < LINE_ENCORE_SHARE) said = say('playing', name, tags);
      lastSaid = said ?? present(encoreBubble(encoreMoods(snap, tags), live.bubbleStyle, Math.random, lastSaid), ENCORE_MS);
    }
    // With bubbles switched off the action is all an encore can do.
    if (!live.bubbles || Math.random() < ENCORE_ACT_CHANCE) onact?.();
  });
  onDestroy(() => {
    clear();
    encores.stop();
  });

  let lineH = $state(0);
  /** A sticker stuck on slightly crooked, the same way for the same line. */
  function tilt(text: string): number {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) | 0;
    return (Math.abs(h) % 5) - 2;
  }

  // What the last update looked like, to spot a new track, a pause and a reroll.
  let shownKey: string | null = null;
  let lastPack = '';
  let lastCanReroll = false;
  let wasPlaying = false;
  let pausedAt: number | null = null;

  // A tap gets a line (a few quick ones: "stop poking me"); nothing to say: no bubble.
  let lastPoke = untrack(() => poke);
  $effect(() => {
    const p = poke;
    untrack(() => {
      if (p === lastPoke) return;
      lastPoke = p;
      const event = talker.tap();
      if (live.bubbles) say(event, 'eyes');
    });
  });

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
        const tags = forThis ? draw.tags : null;
        if (playing && key !== shownKey && (forThis || draw.locked)) {
          // The draw for the new track has arrived (or the character is locked): say what it is.
          shownKey = key;
          lastPack = draw.packId;
          longSaidAt = 0;
          pausedAt = null;
          const name = pickEmoji(snap, tags);
          lastSaid = (talker.lateNightDue() && say('late_night', name, tags)) || say('playing', name, tags) || show(name, TRACK_MS, key);
        } else if (forThis && draw.packId !== lastPack) {
          // 换一次: the new character introduces itself.
          if (lastCanReroll && !draw.canReroll && !draw.locked) say('appear', EVENT_EMOJI.reroll) ?? show(EVENT_EMOJI.reroll, REROLL_MS);
          lastPack = draw.packId;
        } else if (playing && !wasPlaying && key === shownKey && pausedAt !== null && Date.now() - pausedAt >= RESUME_AFTER_MS) {
          say('resumed', pickEmoji(snap, tags), tags);
        }
        if (playing) pausedAt = null;
        if (wasPlaying && !playing) {
          pausedAt = Date.now();
          say('paused', EVENT_EMOJI.pause, tags) ?? show(EVENT_EMOJI.pause, PAUSE_MS);
        }
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
  <!-- A line of two rows grows upwards, so it doesn't cover the character's face. -->
  <div class="lift" style:translate={content.kind === 'line' ? `0 ${-Math.max(0, lineH - size * 0.62)}px` : undefined}>
    <div
      class="bubble"
      class:leaving={shown.leaving}
      class:on-left={side === 'left'}
      class:text={content.kind === 'kaomoji'}
      class:line={content.kind === 'line'}
      style:--size="{size}px"
      style:rotate={content.kind === 'line' ? `${tilt(content.text)}deg` : undefined}
      bind:clientHeight={lineH}
      data-testid="happydesk-bubble"
      data-kind={content.kind}
      data-emoji={content.name}
      data-kaomoji={content.kind === 'kaomoji' ? content.text : undefined}
      data-line={content.kind === 'line' ? content.text : undefined}
    >
      {#key shown.id}
        {#if content.kind === 'emoji'}
          <EmojiSprite name={content.name} size={Math.round(size * 0.78)} />
        {:else if content.kind === 'line'}
          <span class="line-text" lang={i18n.lang === 'zh' ? 'zh-CN' : i18n.lang}>{content.text}</span>
        {:else}
          <span class="kaomoji">{content.text}</span>
        {/if}
      {/key}
    </div>
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
  /* A line: a rounded sticker as wide as its text, two rows at most. */
  .bubble.line {
    width: max-content;
    max-width: max(170px, calc(var(--size) * 3.2));
    height: auto;
    min-height: calc(var(--size) * 0.62);
    box-sizing: border-box;
    padding: calc(var(--size) * 0.1) calc(var(--size) * 0.22);
    border-radius: calc(var(--size) * 0.26);
  }
  .line-text {
    font: 600 max(12px, calc(var(--size) * 0.21)) / 1.35 system-ui, 'Hiragino Sans', 'Yu Gothic UI', 'Microsoft YaHei', sans-serif;
    color: #3a2748;
    text-align: center;
    line-break: strict;
    /* Japanese breaks between phrases, not inside a word; two rows come out even. */
    word-break: auto-phrase;
    text-wrap: balance;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
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
