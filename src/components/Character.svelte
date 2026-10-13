<script lang="ts">
  import { untrack } from 'svelte';
  import { Stage } from '../lib/render/renderer';
  import { assetFor, type LoadedPack, type StateName } from '../lib/pack/types';

  let {
    pack,
    mood,
    poke = 0,
    act = 0,
  }: {
    pack: LoadedPack;
    mood: StateName;
    /** Counts the user's clicks on the character. */
    poke?: number;
    /** Counts the times the character should do its action by itself (encores in a long play). */
    act?: number;
  } = $props();

  let host: HTMLDivElement;
  let stage = $state.raw<Stage | undefined>();
  /** A non-looping state playing once (appear / click) before returning to `mood`. */
  let oneShot = $state<StateName | null>(null);

  $effect(() => {
    const s = new Stage(host, pack.size);
    stage = s;
    oneShot = pack.states.appear ? 'appear' : null;
    return () => s.destroy();
  });

  // Each click or encore plays the action once; a new character does not replay an old one.
  let seen: { poke: number; act: number } | undefined;
  $effect(() => {
    const now = { poke, act };
    untrack(() => {
      const poked = !!seen && now.poke !== seen.poke;
      const acted = !!seen && now.act !== seen.act;
      seen = now;
      if (!pack.states.click) return;
      // An encore only mid-play: a paused character holds still.
      if (poked || (acted && mood === 'playing')) oneShot = 'click';
    });
  });

  $effect(() => {
    if (!stage) return;
    const shot = oneShot;
    const asset = assetFor(pack, shot ?? mood);
    if (!shot) {
      // Paused media: the character holds still too (and is dimmed, below).
      stage.show(asset, undefined, { still: mood === 'paused' });
      return;
    }
    stage.show(asset, () => (oneShot = null));
    // Guard against one-shot assets that loop forever.
    const t = setTimeout(() => (oneShot = null), 4000);
    return () => clearTimeout(t);
  });
</script>

<div
  class="character"
  class:playing={mood === 'playing'}
  class:paused={mood === 'paused'}
  data-state={oneShot ?? mood}
  bind:this={host}
  style:width="{pack.size.w}px"
  style:height="{pack.size.h}px"
></div>

<style>
  .character {
    pointer-events: none;
    /* Feet stay put while the body bobs. */
    transform-origin: 50% 100%;
    transition:
      filter 0.3s ease,
      opacity 0.3s ease;
  }
  /* Playing: a gentle bob on top of the pack's own frames, so every character moves with the music. */
  .character.playing {
    animation: bob 0.72s ease-in-out infinite;
  }
  /* Paused: frozen on one frame (see the script) and slightly faded. */
  .character.paused {
    filter: saturate(0.55) brightness(0.96);
    opacity: 0.82;
  }
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0) scaleY(1);
    }
    50% {
      transform: translateY(-3%) scaleY(1.02);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .character {
      transition: none;
    }
    .character.playing {
      animation: none;
    }
  }
</style>
