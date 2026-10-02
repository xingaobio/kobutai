<script lang="ts">
  import Character from './Character.svelte';
  import ControlBar from './ControlBar.svelte';
  import type { StateName } from '../lib/pack/types';
  import type { ToBackground } from '../lib/messages';
  import { currentPack, live } from '../lib/ui/live.svelte';

  let { send }: { send: (msg: ToBackground) => void } = $props();

  const pack = $derived(currentPack()!);
  const mood = $derived<StateName>(
    live.registry.primary ? (live.registry.primary.snapshot.playing ? 'playing' : 'paused') : 'idle',
  );
  let poke = $state(0);
</script>

<div class="pip" data-testid="happydesk-pip">
  <button
    class="stage"
    data-testid="happydesk-mascot"
    data-mood={mood}
    data-pack={pack.id}
    aria-label={pack.name}
    onclick={() => poke++}
  >
    <Character {pack} {mood} {poke} />
  </button>
  <ControlBar registry={live.registry} draw={live.draw} packName={pack.name} {send} />
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
    cursor: pointer;
    flex: 1;
    display: grid;
    place-items: end center;
  }
</style>
