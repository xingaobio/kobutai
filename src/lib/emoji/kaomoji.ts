import { stable } from './pick';
import type { EmojiName } from './sheets.gen';

/** What the bubble shows: animated emoji, kaomoji (颜文字), or a mix of both (default). */
export type BubbleStyle = 'mix' | 'emoji' | 'kaomoji';

export type BubbleContent = { kind: 'emoji'; name: EmojiName } | { kind: 'kaomoji'; name: EmojiName; text: string };

/**
 * Kaomoji for each mood the emoji picker can choose, so both kinds of bubble say
 * the same thing (rock → headbanging, lo-fi → sleepy calm, a birthday → cheering).
 * Only characters common system fonts have: no rare combining marks.
 */
export const KAOMOJI: Record<EmojiName, readonly string[]> = {
  guitar: ['\\m/(≧▽≦)\\m/', '♪ヽ(≧∇≦)ﾉ♪'],
  'rock-hand': ['\\m/(＞＜)\\m/', 'ヽ(`Д´)ﾉ♪'],
  'mirror-ball': ['┏(＾0＾)┛┗(＾0＾)┓', '♪┏(・o・)┛♪'],
  dancer: ['└(＾＾)┐┌(＾＾)┘', 'ヽ(°〇°)ﾉ♪'],
  violin: ['♪～(´ε｀ )', '(￣▽￣)♪～'],
  drum: ['(ﾉ´∀｀)ﾉ♪', '♪(ﾉ゜∀゜)ﾉ'],
  notes: ['♪(´▽｀)', '♪～(￣ε￣)'],
  coffee: ['( ˘ω˘ )～♪', '(っ˘ω˘ς )'],
  cool: ['(⌐■_■)', '( •_•)>⌐■-■'],
  fire: ['ᕦ(ò_ó)ᕤ', '(ﾉ｀Д´)ﾉ彡'],
  sparkles: ['☆*:.｡.o(≧▽≦)o.｡.:*☆', '(ﾉ>ω<)ﾉ ☆'],
  star: ['(☆▽☆)', '☆彡(ﾉ^ω^)ﾉ'],
  heart: ['(´▽`ʃ♡ƪ)', '(*´▽`*)♡'],
  'party-popper': ['ヽ(＾Д＾)ﾉ', '＼(＾▽＾)／'],
  'party-face': ['＼(≧▽≦)／', '(ﾉ´ヮ`)ﾉ*:･ﾟ'],
  popcorn: ['(・ω・)つ🍿', '(￣～￣)'],
  eyes: ['(・_・ヾ', '(ʘ‿ʘ)'],
  thinking: ['(・・？)', '(´-ω-`)'],
  sleepy: ['(｡-ω-)zzZ', '(_ _).｡o○'],
  cake: ['٩(◕‿◕｡)۶', 'ヽ(＾▽＾)ﾉ🎂'],
  rain: ['(´・ω・`)☂', '(´-ω-`)☔'],
  sob: ['(´；ω；`)', '(╥﹏╥)'],
  joy: ['(≧▽≦)', '(ﾟ∀ﾟ)ｗｗｗ'],
  ghost: ['(((;°Д°)))', 'ヒィ(((ﾟДﾟ)))'],
  rainbow: ['(*^▽^*)', '☆(ゝω・)v'],
};

/**
 * Turn the picked mood into a bubble in the user's style. `seed` keeps the choice
 * stable for one track (every tab picks on its own and must agree).
 */
export function bubbleFor(name: EmojiName, style: BubbleStyle, seed: string): BubbleContent {
  const kind = style === 'mix' ? stable(['emoji', 'kaomoji'] as const, `kind|${seed}`) : style;
  return kind === 'emoji' ? { kind, name } : { kind, name, text: stable(KAOMOJI[name], seed) };
}
