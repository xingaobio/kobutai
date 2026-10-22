<script lang="ts">
  import Bubble from './Bubble.svelte';
  import Character from './Character.svelte';
  import ControlBar from './ControlBar.svelte';
  import { localName } from '../lib/i18n/ui.svelte';
  import type { StateName } from '../lib/pack/types';
  import type { ToBackground } from '../lib/messages';
  import { currentPack, live } from '../lib/ui/live.svelte';

  let { send }: { send: (msg: ToBackground) => void } = $props();

  const pack = $derived(currentPack()!);
  const mood = $derived<StateName>(
    live.registry.primary ? (live.registry.primary.snapshot.playing ? 'playing' : 'paused') : 'idle',
  );
  let poke = $state(0);
  let act = $state(0);
</script>

<div class="pip" data-testid="happydesk-pip">
  <button
    class="stage"
    data-testid="happydesk-mascot"
    data-mood={mood}
    data-pack={pack.id}
    aria-label={localName(pack)}
    onclick={() => poke++}
  >
    <span class="figure">
      <Character {pack} {mood} {poke} {act} />
      <span class="pip-bubble"><Bubble size={56} {poke} onact={() => act++} /></span>
    </span>
  </button>
  <ControlBar registry={live.registry} draw={live.draw} packName={localName(pack)} {send} />
</div>

<style>
  .pip {
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px;
    background: #18181e;
  }
  .stage {
    all: unset;
    position: relative;
    cursor: pointer;
    flex: 1;
    display: grid;
    place-items: end center;
  }
  /* The bubble rides on the character's top-right corner, like on the page. */
  .figure {
    position: relative;
    display: block;
  }
  .pip-bubble {
    position: absolute;
    width: max-content;
    top: 0;
    right: -20px;
    pointer-events: none;
  }
</style>
