<script lang="ts">
  /** The Kobutai mark: a pink "K" sticker on a pink tile (same artwork as public/logo.svg), plus the wordmark. */
  let { size = 30, word = true }: { size?: number; word?: boolean } = $props();
</script>

<span class="logo">
  <svg class="mark" width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
    <rect x="4" y="4" width="120" height="120" rx="28" fill="#FF8DBB" />
    <g transform="rotate(-7 64 64)">
      <rect x="21" y="22" width="90" height="90" rx="24" fill="#3A2748" opacity="0.22" />
      <path d="M42 18 H86 C99 18 108 27 108 40 V78 L76 108 H42 C29 108 20 99 20 86 V40 C20 27 29 18 42 18 Z" fill="#FFFFFF" />
      <path d="M108 78 L76 108 V86 C76 81 80 78 85 78 Z" fill="#FFD3E5" />
      <rect x="38" y="34" width="18" height="60" rx="9" fill="#E0559B" />
      <path d="M54 66 L80 37" stroke="#E0559B" stroke-width="18" stroke-linecap="round" />
      <path d="M58 62 L80 90" stroke="#E0559B" stroke-width="18" stroke-linecap="round" />
    </g>
    <path d="M104 10 L108 20 L118 22 L110 29 L112 39 L104 34 L96 39 L98 29 L90 22 L100 20 Z" fill="#FFE27A" stroke="#3A2748" stroke-width="2.5" stroke-linejoin="round" />
  </svg>
  {#if word}<span class="word display" style:font-size="{Math.round(size * 0.72)}px">Kobutai</span>{/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .mark {
    flex: none;
    display: block;
  }
  .word {
    line-height: 1;
    /* The wordmark keeps its own face in every language. */
    font-family: 'Kobutai Display', var(--font-display);
  }
</style>
