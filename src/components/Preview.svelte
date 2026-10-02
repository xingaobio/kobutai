<script lang="ts">
  import { Stage } from '../lib/render/renderer';
  import { assetFor, type LoadedPack, type StateName } from '../lib/pack/types';

  let { pack, state = 'idle', scale = 0.5 }: { pack: LoadedPack; state?: StateName; scale?: number } = $props();
  let host: HTMLDivElement;

  $effect(() => {
    const s = new Stage(host, pack.size);
    s.show(assetFor(pack, state));
    return () => s.destroy();
  });
</script>

<div class="frame" style:width="{pack.size.w * scale}px" style:height="{pack.size.h * scale}px">
  <div bind:this={host} style:transform="scale({scale})" style:transform-origin="0 0"></div>
</div>

<style>
  .frame {
    overflow: hidden;
  }
</style>
