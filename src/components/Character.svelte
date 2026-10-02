<script lang="ts">
  import { Stage } from '../lib/render/renderer';
  import { assetFor, type LoadedPack, type StateName } from '../lib/pack/types';

  let { pack, mood, poke = 0 }: { pack: LoadedPack; mood: StateName; poke?: number } = $props();

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

  $effect(() => {
    if (poke > 0 && pack.states.click) oneShot = 'click';
  });

  $effect(() => {
    if (!stage) return;
    const shot = oneShot;
    const asset = assetFor(pack, shot ?? mood);
    if (!shot) {
      stage.show(asset);
      return;
    }
    stage.show(asset, () => (oneShot = null));
    // Guard against one-shot assets that loop forever.
    const t = setTimeout(() => (oneShot = null), 4000);
    return () => clearTimeout(t);
  });
</script>

<div class="character" bind:this={host} style:width="{pack.size.w}px" style:height="{pack.size.h}px"></div>

<style>
  .character {
    pointer-events: none;
  }
</style>
