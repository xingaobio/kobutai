<script lang="ts">
  import Preview from '@/components/Preview.svelte';
  import type { LoadedPack } from '@/lib/pack/types';
  import { lockedPack, type CollectionEntry } from '@/lib/settings';

  let { packs, collection, locked }: { packs: LoadedPack[]; collection: Record<string, CollectionEntry>; locked: string | null } =
    $props();

  const got = $derived(packs.filter((p) => collection[p.id]).length);
  const sorted = $derived(
    [...packs].sort((a, b) => Number(!!collection[b.id]) - Number(!!collection[a.id]) || a.name.localeCompare(b.name)),
  );
  const POOL: Record<string, string> = {
    jpop: 'J-Pop', anime: '动漫', 'western-pop': '欧美流行', hiphop: '说唱', rock: '摇滚', electronic: '电子',
    classical: '古典', lofi: 'Lo-fi', cpop: '华语', other: '其他', music: '音乐', video: '视频', live: '直播', podcast: '播客',
  };
  const poolLabel = (p: LoadedPack) => {
    const t = [...p.tags.genre, ...(p.tags.genre.length ? [] : p.tags.type)].map((x) => POOL[x] ?? x);
    return t.length ? t.join(' · ') : '通用池';
  };
</script>

<section>
  <div class="head">
    <h2>图鉴</h2>
    <p class="progress" data-testid="collection-progress">已收集 <b>{got}</b> / {packs.length}</p>
  </div>
  <p class="hint">每当开始播放新内容，就会从对应曲风的池子里随机抽一个角色。没抽到过的角色会显示为剪影。</p>

  <ul class="grid">
    {#each sorted as p (p.id)}
      {@const c = collection[p.id]}
      <li class="card" class:missing={!c} data-testid="collection-card" data-pack={p.id} data-collected={!!c}>
        <div class="art"><Preview pack={p} scale={0.55} /></div>
        <div class="name">{c ? p.name : '？？？'}</div>
        <div class="meta">{poolLabel(p)}</div>
        {#if c}
          <div class="meta">抽到 {c.n} 次</div>
          <button
            class="lock"
            class:on={locked === p.id}
            onclick={() => lockedPack.setValue(locked === p.id ? null : p.id)}
          >{locked === p.id ? '🔒 已锁定' : '锁定这个角色'}</button>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
    font-size: 20px;
  }
  .progress {
    margin: 0;
    color: var(--muted);
  }
  .progress b {
    color: var(--accent);
    font-size: 18px;
  }
  .hint {
    color: var(--muted);
    margin: 4px 0 20px;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }
  .art {
    height: 120px;
    display: grid;
    place-items: end center;
  }
  .missing .art {
    filter: var(--silhouette);
  }
  .name {
    font-weight: 600;
    margin-top: 6px;
  }
  .meta {
    font-size: 12px;
    color: var(--muted);
  }
  .lock {
    margin-top: 8px;
    border: 1px solid var(--line);
    background: none;
    color: var(--text);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .lock.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
