import { describe, expect, test, vi } from 'vitest';
import { TITLE_CASES } from '../../../tests/fixtures/titles';
import type { PetdexEntry } from '../petdex';
import { AutoMatcher, INDEX_TTL_MS, MAX_AUTO_PACKS, packIdFor, within, type AutoMatchDeps, type MatchIndex } from './auto';
import { RuleMatcher, normalizeText, tableProblems, type MatchRule } from './matcher';
import { MATCH_RULES } from './table';

const rule = (id: string, keys: MatchRule['keys'], petdex: string[], artist?: string[]): MatchRule => ({
  id,
  kind: 'character',
  label: id,
  keys,
  artist,
  petdex,
});
const find = (rules: MatchRule[], title: string, artist = '') => new RuleMatcher(rules).find({ title, artist })?.id ?? null;

describe('RuleMatcher', () => {
  test('normalises width, case, zero-width characters and spacing', () => {
    expect(normalizeText(' ＨＡＴＳＵＮＥ​  Miku ')).toBe('hatsune miku');
  });

  test('Latin phrases only match as whole words', () => {
    const rules = [rule('ado', ['ado'], ['a']), rule('pepe', ['pepe the frog'], ['p'])];
    expect(find(rules, 'Ado - 唱')).toBe('ado');
    expect(find(rules, 'Avocado toast recipe')).toBeNull();
    expect(find(rules, 'Much ADO about nothing')).toBe('ado');
    expect(find(rules, 'Pepe Aguilar - Por Mujeres Como Tú')).toBeNull();
    expect(find(rules, 'pepe the frog explained')).toBe('pepe');
  });

  test('CJK phrases match inside a title, however it is spaced', () => {
    const rules = [rule('miku', ['初音ミク'], ['m'])];
    expect(find(rules, '【初音ミク】千本桜【MMD】')).toBe('miku');
    expect(find(rules, '初音 ミク - ワールドイズマイン')).toBe('miku');
    expect(find(rules, '千本桜 covered by someone')).toBeNull();
  });

  test('an array key needs every phrase', () => {
    const rules = [rule('onk', [['yoasobi', 'アイドル']], ['a'])];
    expect(find(rules, 'YOASOBI「アイドル」 Official Music Video')).toBe('onk');
    expect(find(rules, 'アイドル', 'Ayase / YOASOBI')).toBe('onk');
    expect(find(rules, 'YOASOBI - 夜に駆ける')).toBeNull();
    expect(find(rules, 'アイドルマスター ライブ')).toBeNull();
  });

  test('artist keys look at the artist field only', () => {
    const rules = [rule('ado', [], ['a'], ['ado'])];
    expect(find(rules, '唱', 'Ado')).toBe('ado');
    expect(find(rules, 'Much ado about nothing', 'BBC')).toBeNull();
  });

  test('the first matching rule wins', () => {
    const rules = [rule('specific', ['bombardiro'], ['b']), rule('general', ['brainrot'], ['x'])];
    expect(find(rules, 'Bombardiro Crocodilo brainrot')).toBe('specific');
    expect(find(rules, 'italian brainrot ranking')).toBe('general');
  });
});

describe('MATCH_RULES', () => {
  test('the table is well formed', () => {
    expect(tableProblems(MATCH_RULES)).toEqual([]);
  });

  test('tableProblems reports unusable rules', () => {
    const bad: MatchRule[] = [
      rule('a', ['x'], ['ok']),
      rule('a', ['fine key'], []),
      rule('b', [], ['Not A Slug']),
      rule('c', ['猫'], ['ok']),
    ];
    expect(tableProblems(bad)).toEqual([
      'a: key "x" is too short',
      'duplicate rule id "a"',
      'a: no characters',
      'b: no keys',
      'b: "Not A Slug" is not a Petdex slug',
      'c: key "猫" is too short',
    ]);
  });

  // The project's own title set: what must match, and — just as important — what must not.
  const EXPECTED: Record<string, string> = {
    'YOASOBI「アイドル」 Official Music Video': 'oshi-no-ko',
    'Ado「唱」MUSIC VIDEO': 'ado',
    'TVアニメ「呪術廻戦」第2期 OPテーマ 青のすみか': 'jujutsu-kaisen',
    '【初音ミク】千本桜【MMD】': 'hatsune-miku',
    'Chainsaw Man - Opening | KICK BACK': 'chainsaw-man',
    '周杰伦《晴天》4K修复版MV': 'jay-chou',
    孤勇者: 'arcane',
    光年之外: 'gem',
    'Kendrick Lamar - Not Like Us': 'kendrick-lamar',
    'Lose Yourself': 'eminem',
  };

  test('fixture titles: the known characters match and nothing else does', () => {
    const matcher = new RuleMatcher(MATCH_RULES);
    for (const title of Object.keys(EXPECTED)) expect(TITLE_CASES.some((c) => c.title === title), title).toBe(true);
    const got = Object.fromEntries(TITLE_CASES.map((c) => [c.title, matcher.find(c)?.id ?? null]));
    const want = Object.fromEntries(TITLE_CASES.map((c) => [c.title, EXPECTED[c.title] ?? null]));
    expect(got).toEqual(want);
  });

  test.each([
    ['奶龙唱歌合集 第三期', '', 'nailong'],
    ['哈基米哈基米哈基米 完整版', '', 'hachimi'],
    ['圆头耄耋哈气名场面', '', 'maodie'],
    ['Chiikawa OP ひとりごつ', '', 'chiikawa'],
    ['TUNG TUNG TUNG SAHUR song 1 hour', '', 'tung-tung-sahur'],
    ['Italian Brainrot Animals ranked', '', 'italian-brainrot'],
    ['卡皮巴拉之歌 Capybara Song', '', 'capybara'],
    ['OIIA OIIA spinning cat 10 hours', '', 'oiia-cat'],
    ['SPY×FAMILY Season 2 OP', 'TOHO animation', 'spy-family'],
    ['Minecraft, But I Can Only Use Wood', 'Someone', 'minecraft'],
    ['One Piece - Opening 26', 'Toei', 'one-piece-luffy'],
    // VTubers: by title, or by the channel name in the artist field.
    ['Neuro-sama sings Bad Apple', '', 'neuro-sama'],
    ['Evil Neuro and Neuro-sama karaoke duet', '', 'evil-neuro'],
    ['【歌回】晚安歌', '嘉然今天吃什么', 'asoul-jiaran'],
    ['向晚大魔王 生日会', '', 'asoul-xiangwan'],
    ['A-SOUL 新年演唱会 贝拉 独舞', 'A-SOUL_Official', 'asoul-bella'],
    ['A-SOUL 新年演唱会', 'A-SOUL_Official', 'asoul'],
    ['【直播回放】打游戏', '七海Nana7mi', 'nana7mi'],
    ['永雏塔菲 唱歌合集', '', 'ace-taffy'],
  ])('%s → %s', (title, artist, id) => {
    expect(new RuleMatcher(MATCH_RULES).find({ title, artist })?.id).toBe(id);
  });

  test.each([
    'How to cook pepe nero pasta',
    '胡桃夹子 柴可夫斯基',
    'She wore a one piece swimsuit',
    'Queen - Bohemian Rhapsody',
    'Feeling loopy after no sleep',
    'Jack Kirby documentary',
    'Arcane secrets of medieval alchemy',
    'DOGE cuts explained | news',
    '向晚的风 吉他弹唱',
    'Princess Diana documentary',
    '七海建人 名场面',
    'Bella Ciao - La Casa de Papel',
  ])('"%s" matches nothing', (title) => {
    expect(new RuleMatcher(MATCH_RULES).find({ title, artist: 'Some Channel' })).toBeNull();
  });
});

// --- AutoMatcher -------------------------------------------------------------------

const RULES: MatchRule[] = [rule('miku', ['初音ミク'], ['miku-a', 'miku-b']), rule('solo', ['solo'], ['only'])];
const entry = (slug: string): PetdexEntry => ({
  slug,
  displayName: slug.toUpperCase(),
  submittedBy: 'someone',
  spritesheetUrl: `https://assets.petdex.dev/pets/${slug}/sprite.webp`,
  petJsonUrl: `https://assets.petdex.dev/pets/${slug}/petjson.json`,
});

function setup(opts: Partial<{ enabled: boolean; installed: string[]; manifest: PetdexEntry[]; index: MatchIndex | null; rules: MatchRule[] }> = {}) {
  const state = {
    enabled: opts.enabled ?? true,
    installed: [...(opts.installed ?? [])],
    index: opts.index ?? null,
    used: {} as Record<string, number>,
    pinned: [] as string[],
    now: 1_000_000,
    failImport: new Set<string>(),
    manifestFails: false,
  };
  const fetchManifest = vi.fn(async () => {
    if (state.manifestFails) throw new Error('offline');
    return opts.manifest ?? [entry('miku-a'), entry('miku-b'), entry('only'), entry('unrelated')];
  });
  const importPet = vi.fn(async (pet: { slug: string }) => {
    if (state.failImport.has(pet.slug)) throw new Error('HTTP 500');
    const id = packIdFor(pet.slug);
    state.installed.push(id);
    return id;
  });
  const removePack = vi.fn(async (id: string) => void (state.installed = state.installed.filter((x) => x !== id)));
  const deps: AutoMatchDeps = {
    enabled: async () => state.enabled,
    rules: opts.rules ?? RULES,
    index: { get: async () => state.index, set: async (v) => void (state.index = v) },
    used: { get: async () => state.used, set: async (v) => void (state.used = v) },
    fetchManifest,
    installed: async () => state.installed,
    importPet,
    removePack,
    pinned: async () => state.pinned,
    now: () => state.now,
  };
  return { matcher: new AutoMatcher(deps), state, fetchManifest, importPet, removePack };
}
const MIKU = { title: '【初音ミク】千本桜', artist: '' };

describe('AutoMatcher', () => {
  test('does nothing while the setting is off', async () => {
    const { matcher, fetchManifest, importPet } = setup({ enabled: false });
    expect(await matcher.match(MIKU)).toBeNull();
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(importPet).not.toHaveBeenCalled();
  });

  test('content that names nothing never touches the network', async () => {
    const { matcher, fetchManifest } = setup();
    expect(await matcher.match({ title: 'Deep House Mix 2024', artist: 'Mr. Mix' })).toBeNull();
    expect(fetchManifest).not.toHaveBeenCalled();
  });

  test('first match downloads one character and keeps only the needed slice of the manifest', async () => {
    const { matcher, state, fetchManifest, importPet } = setup();
    expect(await matcher.match(MIKU)).toBe('petdex-miku-a');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    expect(importPet).toHaveBeenCalledTimes(1);
    expect(importPet.mock.calls[0]![0]).toEqual({
      slug: 'miku-a',
      displayName: 'MIKU-A',
      submittedBy: 'someone',
      spritesheetUrl: 'https://assets.petdex.dev/pets/miku-a/sprite.webp',
    });
    expect(Object.keys(state.index!.pets).sort()).toEqual(['miku-a', 'miku-b', 'only']);
    expect(state.used).toEqual({ 'petdex-miku-a': state.now });
  });

  test('the rule\'s first character is the one downloaded; one already installed is used instead of downloading', async () => {
    const fresh = setup();
    expect(await fresh.matcher.match(MIKU)).toBe('petdex-miku-a');
    const both = setup({ installed: ['petdex-miku-b', 'petdex-miku-a'] });
    expect(await both.matcher.match(MIKU)).toBe('petdex-miku-a');
    const later = setup({ installed: ['petdex-miku-b'] });
    expect(await later.matcher.match(MIKU)).toBe('petdex-miku-b');
    expect(later.importPet).not.toHaveBeenCalled();
  });

  test('an installed character is reused with no network at all', async () => {
    const { matcher, state, fetchManifest, importPet } = setup({ installed: ['petdex-miku-b'] });
    expect(await matcher.match(MIKU)).toBe('petdex-miku-b');
    expect(fetchManifest).not.toHaveBeenCalled();
    expect(importPet).not.toHaveBeenCalled();
    // Imported by hand → not tracked, so it can never be evicted.
    expect(state.used).toEqual({});
  });

  test('the manifest is cached for a day, then refreshed', async () => {
    const { matcher, state, fetchManifest } = setup();
    await matcher.match(MIKU);
    await matcher.match({ title: 'solo', artist: '' });
    expect(fetchManifest).toHaveBeenCalledTimes(1);
    state.installed = [];
    state.now += INDEX_TTL_MS + 1;
    await matcher.match(MIKU);
    expect(fetchManifest).toHaveBeenCalledTimes(2);
  });

  test('a stale index is still used when the manifest cannot be refreshed', async () => {
    const index: MatchIndex = { at: 0, pets: { only: entry('only') } };
    const { matcher, state, fetchManifest } = setup({ index });
    state.now = INDEX_TTL_MS + 5;
    state.manifestFails = true;
    expect(await matcher.match({ title: 'solo', artist: '' })).toBe('petdex-only');
    expect(fetchManifest).toHaveBeenCalledTimes(1);
  });

  test('offline with no index: no match, no throw', async () => {
    const { matcher, state } = setup();
    state.manifestFails = true;
    expect(await matcher.match(MIKU)).toBeNull();
  });

  test('a failed download falls back to the rule\'s next character', async () => {
    const { matcher, state, importPet } = setup();
    state.failImport.add('miku-a');
    expect(await matcher.match(MIKU)).toBe('petdex-miku-b');
    expect(importPet).toHaveBeenCalledTimes(2);
  });

  test('characters missing from the manifest are skipped', async () => {
    const { matcher } = setup({ manifest: [entry('miku-b')] });
    expect(await matcher.match(MIKU)).toBe('petdex-miku-b');
    expect(await matcher.match({ title: 'solo', artist: '' })).toBeNull();
  });

  test('keeps at most MAX_AUTO_PACKS downloads: evicts the least recently matched, never a pinned one', async () => {
    const n = MAX_AUTO_PACKS + 2;
    const rules = Array.from({ length: n }, (_, i) => rule(`r${i}`, [`title${i}x`], [`pet${i}`]));
    const { matcher, state, removePack } = setup({ rules, manifest: rules.map((r) => entry(r.petdex[0]!)) });
    state.pinned = ['petdex-pet0'];
    for (let i = 0; i < n; i++) {
      state.now += 1000;
      expect(await matcher.match({ title: `title${i}x`, artist: '' })).toBe(`petdex-pet${i}`);
    }
    // pet0 is pinned (oldest), so pet1 and pet2 went instead.
    expect(removePack.mock.calls.map((c) => c[0])).toEqual(['petdex-pet1', 'petdex-pet2']);
    expect(Object.keys(state.used)).toHaveLength(MAX_AUTO_PACKS);
    expect(state.installed).toContain('petdex-pet0');
    expect(state.installed).toContain(`petdex-pet${n - 1}`);
  });

  test('re-matching a downloaded character refreshes its place in the queue', async () => {
    const { matcher, state } = setup();
    await matcher.match(MIKU);
    state.now += 5000;
    await matcher.match(MIKU);
    expect(state.used['petdex-miku-a']).toBe(state.now);
  });

  test('downloads the user deleted are forgotten', async () => {
    const { matcher, state } = setup();
    await matcher.match(MIKU);
    state.installed = [];
    await matcher.match({ title: 'solo', artist: '' });
    expect(Object.keys(state.used)).toEqual(['petdex-only']);
  });

  test('concurrent matches for one rule download once', async () => {
    const { matcher, importPet } = setup();
    const [a, b] = await Promise.all([matcher.match(MIKU), matcher.match(MIKU)]);
    expect(a).toBe('petdex-miku-a');
    expect(b).toBe('petdex-miku-a');
    expect(importPet).toHaveBeenCalledTimes(1);
  });
});

describe('AutoMatcher.alternative ("换一次" on a matched character)', () => {
  const THREE: MatchRule[] = [rule('miku', ['初音ミク'], ['miku-a', 'miku-b', 'miku-c'])];
  const manifest = [entry('miku-a'), entry('miku-b'), entry('miku-c')];

  test('gives the next character after the current one, downloading it if needed', async () => {
    const { matcher, importPet } = setup({ rules: THREE, manifest, installed: ['petdex-miku-a'] });
    expect(await matcher.alternative(MIKU, 'petdex-miku-a')).toBe('petdex-miku-b');
    expect(importPet).toHaveBeenCalledTimes(1);
  });

  test('wraps around, and prefers one that is already installed', async () => {
    const { matcher, importPet } = setup({ rules: THREE, manifest, installed: ['petdex-miku-a', 'petdex-miku-c'] });
    expect(await matcher.alternative(MIKU, 'petdex-miku-c')).toBe('petdex-miku-a');
    expect(await matcher.alternative(MIKU, 'petdex-miku-b')).toBe('petdex-miku-c');
    expect(importPet).not.toHaveBeenCalled();
  });

  test('null when the rule has only one character, or the setting is off', async () => {
    const one = setup({ rules: [rule('solo', ['solo'], ['only'])] });
    expect(await one.matcher.alternative({ title: 'solo', artist: '' }, 'petdex-only')).toBeNull();
    const off = setup({ rules: THREE, manifest, enabled: false });
    expect(await off.matcher.alternative(MIKU, 'petdex-miku-a')).toBeNull();
  });
});

describe('within', () => {
  test('passes a fast result through, falls back on slow or failed ones', async () => {
    vi.useFakeTimers();
    try {
      await expect(within(Promise.resolve('x'), 100, null)).resolves.toBe('x');
      await expect(within(Promise.reject(new Error('no')), 100, null)).resolves.toBeNull();
      const slow = within(new Promise<string>((r) => setTimeout(() => r('late'), 500)), 100, null);
      await vi.advanceTimersByTimeAsync(150);
      await expect(slow).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
