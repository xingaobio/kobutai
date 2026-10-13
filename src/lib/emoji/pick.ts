import { normalizeText, phraseTest, type Test } from '../match/matcher';
import type { ContentType, Genre } from '../pack/types';
import type { MediaInfo, Tags } from '../tagging/types';
import type { EmojiName } from './sheets.gen';

/**
 * Which emoji the bubble shows. Title words first (a birthday song gets a cake
 * whatever its genre), then the genre, then the content type.
 */
const KEYWORDS: [EmojiName, string[]][] = [
  ['cake', ['birthday', '生日', '誕生日', 'お誕生日']],
  // Not a bare 鬼: it is in 鬼滅の刃 and 鬼畜 too.
  ['ghost', ['ghost', 'horror', 'halloween', '鬼片', '闹鬼', '幽灵', '恐怖', '万圣', 'ホラー', 'お化け']],
  ['rain', ['rain', 'rainy', '雨', '下雨']],
  ['rainbow', ['rainbow', '彩虹', '虹']],
  ['sob', ['sad', 'tears', 'crying', '哭', '泣', '伤心', '悲伤', '难过', '難過', '悲しい']],
  ['joy', ['funny', 'meme', 'prank', '搞笑', '爆笑', '沙雕', '鬼畜', 'おもしろ']],
  ['party-face', ['party', '派对', '派對', 'パーティー']],
  ['heart', ['love', 'i love you', '爱', '愛', '恋', '情歌', 'ラブ']],
  ['fire', ['fire', '燃', '炸裂']],
];

const BY_GENRE: Record<Genre, readonly EmojiName[]> = {
  rock: ['guitar', 'rock-hand'],
  electronic: ['mirror-ball', 'dancer'],
  classical: ['violin'],
  lofi: ['coffee'],
  hiphop: ['cool', 'fire'],
  jpop: ['sparkles', 'star'],
  anime: ['sparkles', 'star'],
  cpop: ['notes', 'heart'],
  'western-pop': ['party-popper', 'dancer'],
  other: ['notes', 'drum'],
};

const BY_TYPE: Record<ContentType, readonly EmojiName[]> = {
  music: ['notes', 'drum'],
  video: ['popcorn', 'eyes'],
  live: ['fire', 'eyes'],
  podcast: ['thinking'],
  other: ['eyes'],
};

/** A few more moods that suit any content of a type: variety for the encores of a long play. */
const ENCORE_EXTRA: Record<ContentType, readonly EmojiName[]> = {
  music: ['heart', 'star'],
  video: ['joy', 'thinking'],
  live: ['party-popper', 'heart'],
  podcast: ['coffee', 'eyes'],
  other: ['notes'],
};

/** Bubbles for things the user did rather than what is playing. */
export const EVENT_EMOJI = { pause: 'sleepy', reroll: 'party-face' } as const satisfies Record<string, EmojiName>;

const compiled: [EmojiName, Test[]][] = KEYWORDS.map(([name, words]) => [name, words.map(phraseTest)]);

/** Same content → same emoji, in every tab (each tab picks on its own). */
export function stable<T>(options: readonly T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) | 0;
  return options[Math.abs(h) % options.length]!;
}

function keywordEmoji(info: Pick<MediaInfo, 'title' | 'artist'>): EmojiName | null {
  const text = normalizeText(`${info.title} ${info.artist}`);
  const squeezed = text.replace(/ /g, '');
  for (const [name, tests] of compiled) if (tests.some((t) => t(text, squeezed))) return name;
  return null;
}

export function pickEmoji(info: Pick<MediaInfo, 'title' | 'artist'>, tags?: Pick<Tags, 'type' | 'genre'> | null): EmojiName {
  const keyword = keywordEmoji(info);
  if (keyword) return keyword;
  const seed = `${info.title}|${info.artist}`;
  if (tags?.type === 'music' && tags.genre) return stable(BY_GENRE[tags.genre], seed);
  return stable(BY_TYPE[tags?.type ?? 'music'], seed);
}

/**
 * The moods a long play can cycle through (see ./encore): what the track's own
 * bubble said first, then the other moods of its genre or type, then a few that
 * suit any such content. A title that names its mood (a sad song, a rainy day, a
 * birthday) keeps to that mood and the neutral ones: no party popper on a sad song.
 */
export function encoreMoods(info: Pick<MediaInfo, 'title' | 'artist'>, tags?: Pick<Tags, 'type' | 'genre'> | null): EmojiName[] {
  const type = tags?.type ?? 'music';
  const keyword = keywordEmoji(info);
  if (keyword) return [...new Set([keyword, ...BY_TYPE[type]])];
  const own = type === 'music' && tags?.genre ? BY_GENRE[tags.genre] : [];
  return [...new Set([pickEmoji(info, tags), ...own, ...BY_TYPE[type], ...ENCORE_EXTRA[type]])];
}
