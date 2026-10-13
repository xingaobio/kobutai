<script lang="ts">
  import Icon from './Icon.svelte';
  /** The Kobutai mark: a note on a tilted pink sticker, plus the wordmark. */
  let { size = 30, word = true }: { size?: number; word?: boolean } = $props();
</script>

<span class="logo">
  <span class="mark" style:width="{size}px" style:height="{size}px"><Icon name="note" size={Math.round(size * 0.6)} stroke={2.2} /></span>
  {#if word}<span class="word display" style:font-size="{Math.round(size * 0.72)}px">Kobutai</span>{/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .mark {
    border-radius: 30%;
    background: var(--pink, #ff8dbb);
    color: #3a2748;
    display: grid;
    place-items: center;
    transform: rotate(-6deg);
    flex: none;
  }
  .word {
    line-height: 1;
    /* The wordmark keeps its own face in every language. */
    font-family: 'Kobutai Display', var(--font-display);
  }
</style>
