import type { MatchRule } from './matcher';

/**
 * Content → character rules, checked against the Petdex manifest on 2026-10-07
 * (every slug existed and its description named the subject). Run
 * `npm run match:check` to re-check them against the live manifest.
 *
 * Writing rules:
 * - A key must name the subject by itself. Leave out words that also mean
 *   something else ("idol", "queen", "one piece", "胡桃", "pepe", "loopy").
 *   Pair them with a second phrase instead: ['yoasobi', 'アイドル'].
 * - Give the name in each script people title videos in.
 * - More specific rules go first; the first match wins.
 * - Within a rule, list the most recognisable character first: that is the one shown.
 * - Only list a slug after reading its Petdex description: names repeat and
 *   many pets with a familiar name are something else.
 *
 * See docs/development/SOURCES.md for where these characters come from and what was tested.
 */
export const MATCH_RULES: readonly MatchRule[] = [
  // --- Virtual singers -------------------------------------------------------
  {
    id: 'hatsune-miku',
    kind: 'character',
    label: '初音未来',
    keys: ['初音ミク', '初音未来', '初音未來', 'hatsune miku'],
    petdex: ['hatsune-miku-2', 'hatsune-miku', 'miku', 'miku-metalhead'],
  },
  {
    id: 'luo-tianyi',
    kind: 'character',
    label: '洛天依',
    keys: ['洛天依', 'luo tianyi'],
    petdex: ['tianyi', 'luotianyi-v4', 'tianyi-tiandian'],
  },

  // --- VTubers (checked 2026-10-09) ----------------------------------------------
  // Channel names sit in the artist field, so a stream or 歌回 on the VTuber's own
  // channel matches as well as a title that names them. Members before their group.
  {
    id: 'evil-neuro',
    kind: 'vtuber',
    label: 'Evil Neuro',
    keys: ['evil neuro', 'evilneuro'],
    petdex: ['evil-neuro', 'evil-neuro-2'],
  },
  {
    id: 'neuro-sama',
    kind: 'vtuber',
    label: 'Neuro-sama',
    keys: ['neuro-sama', 'neurosama', 'neuro sama', 'vedal987'],
    petdex: ['neuro-sama', 'evil-neuro'],
  },
  {
    id: 'asoul-jiaran',
    kind: 'vtuber',
    label: 'A-SOUL 嘉然',
    keys: ['嘉然', 'jiaran', ['a-soul', 'diana'], ['asoul', 'diana']],
    petdex: ['jia-ran', 'jiaran-2', 'bunnydeer', 'jiaran-taffy'],
  },
  {
    id: 'asoul-xiangwan',
    kind: 'vtuber',
    label: 'A-SOUL 向晚',
    // "向晚" alone is an ordinary word ("toward evening").
    keys: ['向晚大魔王', ['向晚', 'a-soul'], ['向晚', 'asoul'], ['ava', 'a-soul'], ['ava', 'asoul']],
    petdex: ['xiangwan-ava-v2', 'xiangwan-anniv-guofeng'],
  },
  {
    id: 'asoul-bella',
    kind: 'vtuber',
    label: 'A-SOUL 贝拉',
    keys: ['贝拉kira', 'bella kira', ['贝拉', 'a-soul'], ['贝拉', 'asoul'], ['bella', 'a-soul'], ['bella', 'asoul']],
    petdex: ['kira'],
  },
  {
    id: 'asoul-nailin',
    kind: 'vtuber',
    label: 'A-SOUL 乃琳',
    keys: ['乃琳', ['eileen', 'a-soul'], ['eileen', 'asoul']],
    petdex: ['nailin-high-ponytail'],
  },
  {
    id: 'asoul',
    kind: 'vtuber',
    label: 'A-SOUL（团体）',
    // 换一次 goes through the members.
    keys: ['a-soul', 'asoul'],
    petdex: ['jia-ran', 'xiangwan-ava-v2', 'kira', 'nailin-high-ponytail'],
  },
  {
    id: 'nana7mi',
    kind: 'vtuber',
    label: '七海 Nana7mi',
    // "七海" alone is also 七海灯子, Nanami Kento…
    keys: ['nana7mi'],
    petdex: ['nana7mi'],
  },
  {
    id: 'ace-taffy',
    kind: 'vtuber',
    label: '永雏塔菲',
    keys: ['永雏塔菲', '永雛塔菲', 'ace taffy', 'acetaffy'],
    petdex: ['taffy-2', 'taffy-4', 'taffy-3'],
  },
  {
    id: 'shizuku-nekoha',
    kind: 'vtuber',
    label: '猫羽雫',
    keys: ['猫羽雫'],
    petdex: ['shizuku'],
  },

  // --- Anime, games, cartoons --------------------------------------------------
  {
    id: 'oshi-no-ko',
    kind: 'character',
    label: '【推しの子】',
    keys: ['推しの子', '我推的孩子', 'oshi no ko', '星野アイ', '星野爱', ['yoasobi', 'アイドル'], ['yoasobi', 'idol']],
    petdex: ['ai-hoshino', 'ruby'],
  },
  {
    id: 'jujutsu-kaisen',
    kind: 'character',
    label: '呪術廻戦',
    keys: ['呪術廻戦', '咒术回战', '咒術迴戰', 'jujutsu kaisen', '五条悟', 'gojo satoru', 'satoru gojo'],
    petdex: ['gojo-satoru', 'chibi-satoru-gojo', 'gojo', 'yuji-itadori', 'megumi-fushiguro'],
  },
  {
    id: 'chainsaw-man',
    kind: 'character',
    label: 'チェンソーマン',
    keys: ['チェンソーマン', '电锯人', '鏈鋸人', 'chainsaw man', 'pochita', 'ポチタ', '波奇塔'],
    petdex: ['pochita', 'pochita-mini', 'makima', 'powerpet', 'reze'],
  },
  {
    id: 'arcane',
    kind: 'character',
    label: 'Arcane / 双城之战',
    keys: ['双城之战', '雙城之戰', '孤勇者', ['arcane', 'league of legends'], ['arcane', 'jinx'], ['arcane', 'netflix']],
    petdex: ['jinx-2', 'jinx-rocket', 'jinx-arcane2', 'vi'],
  },
  {
    id: 'frieren',
    kind: 'character',
    label: '葬送のフリーレン',
    keys: ['葬送のフリーレン', 'フリーレン', '芙莉莲', '芙莉蓮', 'frieren'],
    petdex: ['frieren-3', 'frieren-5', 'frieren-chibi', 'frieren-6'],
  },
  {
    id: 'bocchi-the-rock',
    kind: 'character',
    label: 'ぼっち・ざ・ろっく！',
    keys: ['ぼっち・ざ・ろっく', '孤独摇滚', '孤獨搖滾', '結束バンド', '结束乐队', 'bocchi the rock', 'kessoku band'],
    petdex: ['bocchi-guitar', 'kita-guitar-live-v2', 'bocchi-bunny'],
  },
  {
    id: 'one-piece-luffy',
    kind: 'character',
    label: 'ONE PIECE',
    keys: ['ルフィ', '路飞', '魯夫', '海贼王', '航海王', 'luffy', ['one piece', 'anime'], ['one piece', 'opening']],
    petdex: ['luffy-gear5', 'luffy-gear-5-chibi', 'nika-luffy', 'chibi-zoro'],
  },
  {
    id: 'spy-family',
    kind: 'character',
    label: 'SPY×FAMILY',
    keys: ['spy×family', 'spy x family', 'spyxfamily', '间谍过家家', '間諜家家酒', 'アーニャ', '阿尼亚'],
    petdex: ['anya', 'anya-3', 'anya-2'],
  },
  {
    id: 'demon-slayer',
    kind: 'character',
    label: '鬼滅の刃',
    keys: ['鬼滅の刃', '鬼灭之刃', 'demon slayer', 'kimetsu no yaiba', '炭治郎', '祢豆子', '禰豆子'],
    petdex: ['tanjiro-kamado-balanced', 'tanjiro', 'tanjiro-kamado', 'nezuko', 'nezuko-kamado'],
  },
  {
    id: 'naruto',
    kind: 'character',
    label: 'NARUTO',
    keys: ['naruto', 'ナルト', '火影忍者'],
    petdex: ['naruto', 'naruto-six-paths', 'sasuke-2', 'sasuke-3', 'mini-kurama'],
  },
  {
    id: 'dragon-ball',
    kind: 'character',
    label: 'ドラゴンボール',
    keys: ['ドラゴンボール', '龙珠', '七龍珠', 'dragon ball', 'dragonball'],
    petdex: ['goku-3', 'super-saiyan-goku'],
  },
  {
    id: 'rurouni-kenshin',
    kind: 'character',
    label: 'るろうに剣心',
    keys: ['るろうに剣心', '浪客剑心', '神劍闖江湖', 'rurouni kenshin'],
    petdex: ['kenshin', 'xiao-jianxin'],
  },
  {
    id: 'detective-conan',
    kind: 'character',
    label: '名探偵コナン',
    keys: ['名探偵コナン', '名侦探柯南', '名偵探柯南', 'detective conan', 'case closed conan'],
    petdex: ['conan', 'conan-2', 'edogawa-conan', 'pixel-conan'],
  },
  {
    id: 'doraemon',
    kind: 'character',
    label: 'ドラえもん',
    keys: ['ドラえもん', '哆啦a梦', '哆啦A夢', '多啦a梦', 'doraemon'],
    petdex: ['doraemon', 'doraemon-3', 'doraemon-1'],
  },
  {
    id: 'crayon-shin-chan',
    kind: 'character',
    label: 'クレヨンしんちゃん',
    keys: ['クレヨンしんちゃん', '蜡笔小新', '蠟筆小新', 'crayon shin-chan', 'crayon shinchan', 'shin chan'],
    petdex: ['shinchan', 'shinchan-petdex', 'shinchan-3', 'xiaoxin'],
  },
  {
    id: 'mygo',
    kind: 'character',
    label: 'BanG Dream! It’s MyGO!!!!!',
    keys: ['mygo', '迷途之子', '迷子でもいい'],
    petdex: ['anon', 'soyo', 'soyo-2', 'tomori'],
  },
  {
    id: 'nezha',
    kind: 'character',
    label: '哪吒',
    keys: ['哪吒', 'nezha', 'ne zha'],
    petdex: ['nezha', 'nezha-2'],
  },
  {
    id: 'black-myth-wukong',
    kind: 'character',
    label: '黑神话：悟空',
    keys: ['黑神话', '黑神話', 'black myth'],
    petdex: ['wukong-4'],
  },
  {
    id: 'sun-wukong',
    kind: 'character',
    label: '孙悟空（西游记）',
    keys: ['西游记', '西遊記', 'sun wukong', 'monkey king', 'journey to the west'],
    petdex: ['wukong-5', 'wukong-2', 'wukong-3'],
  },
  {
    id: 'hollow-knight',
    kind: 'character',
    label: 'Hollow Knight',
    keys: ['hollow knight', 'silksong', '空洞骑士', '空洞騎士', '丝之歌'],
    petdex: ['xiao-qishi', 'little-knight'],
  },
  {
    id: 'minecraft',
    kind: 'character',
    label: 'Minecraft',
    keys: ['minecraft', 'マインクラフト', 'マイクラ', '我的世界'],
    petdex: ['minecraft-steve', 'minecraft-steve-2'],
  },
  {
    id: 'zelda',
    kind: 'character',
    label: 'The Legend of Zelda',
    keys: ['legend of zelda', 'ゼルダの伝説', '塞尔达传说', '薩爾達傳說', 'tears of the kingdom', 'breath of the wild'],
    petdex: ['zelda-botw', 'zelda'],
  },
  {
    id: 'sonic',
    kind: 'character',
    label: 'Sonic the Hedgehog',
    keys: ['sonic the hedgehog', 'ソニック・ザ・ヘッジホッグ', '刺猬索尼克'],
    petdex: ['sonic-art', 'sonic-pixel'],
  },
  {
    id: 'pikachu',
    kind: 'character',
    label: 'ピカチュウ',
    keys: ['pikachu', 'ピカチュウ', '皮卡丘'],
    petdex: ['capvolt'],
  },
  {
    id: 'kirby',
    kind: 'character',
    label: '星のカービィ',
    keys: ['星のカービィ', '星之卡比', 'kirby and the', "kirby's", ['kirby', 'nintendo']],
    petdex: ['kirby'],
  },
  {
    id: 'spongebob',
    kind: 'character',
    label: 'SpongeBob',
    keys: ['spongebob', 'スポンジボブ', '海绵宝宝', '海綿寶寶'],
    petdex: ['spongebob-star'],
  },
  {
    id: 'snoopy',
    kind: 'character',
    label: 'Snoopy',
    keys: ['snoopy', 'スヌーピー', '史努比'],
    petdex: ['snoopy', 'pixel-beagle-2'],
  },
  {
    id: 'bluey',
    kind: 'character',
    label: 'Bluey',
    keys: ['bluey'],
    petdex: ['happy-puppy-duo'],
  },
  {
    id: 'kuromi',
    kind: 'character',
    label: 'クロミ',
    keys: ['kuromi', 'クロミ', '库洛米', '酷洛米'],
    petdex: ['kuromi-3', 'kuromi-2', 'kuromi'],
  },
  {
    id: 'linabell',
    kind: 'character',
    label: '玲娜贝儿',
    keys: ['玲娜贝儿', '玲娜貝兒', 'linabell', 'lina bell'],
    petdex: ['linabell'],
  },

  // --- Memes: each brainrot character before the catch-all ---------------------
  {
    id: 'bombardiro',
    kind: 'meme',
    label: 'Bombardiro Crocodilo',
    keys: ['bombardiro'],
    petdex: ['bombardiro'],
  },
  {
    id: 'tralalero',
    kind: 'meme',
    label: 'Tralalero Tralala',
    keys: ['tralalero', 'tralala'],
    petdex: ['tralala'],
  },
  {
    id: 'cappuccina',
    kind: 'meme',
    label: 'Ballerina Cappuccina',
    keys: ['ballerina cappuccina', 'cappuccina'],
    petdex: ['cappuccina'],
  },
  {
    id: 'tung-tung-sahur',
    kind: 'meme',
    label: 'Tung Tung Tung Sahur',
    keys: ['tung tung tung', 'tung tung sahur'],
    petdex: ['triple-t', 'triple-t-2'],
  },
  {
    id: 'italian-brainrot',
    kind: 'meme',
    label: 'Italian Brainrot',
    keys: ['italian brainrot', 'brainrot italiano', '意大利脑腐', '意大利山海经'],
    petdex: ['tralala', 'bombardiro', 'cappuccina', 'triple-t'],
  },
  {
    id: 'maodie',
    kind: 'meme',
    label: '耄耋 / 哈气猫',
    keys: ['耄耋', '哈气猫', '哈氣貓', '圆头耄耋'],
    petdex: ['maodie-hiss', 'maodie-2', 'maodie-5', 'maodie', 'round-maodie-c63864e8', 'maodie-4'],
  },
  {
    id: 'hachimi',
    kind: 'meme',
    label: '哈基米',
    // People mean "cat" by 哈基米 now, so show the meme cats rather than the horse girl
    // the sound comes from (Petdex slug "hachimi").
    keys: ['哈基米', 'はちみー', 'ハチミー', 'hachimi', 'hajimi'],
    petdex: ['maodie-2', 'maodie', 'maodie-5', 'happy-cat'],
  },
  {
    id: 'nailong',
    kind: 'meme',
    label: '奶龙',
    keys: ['奶龙', '奶龍', 'nailong'],
    petdex: ['nailong', 'nailong-6', 'nai-long-2', 'nai-long', 'nailong-2'],
  },
  {
    id: 'chiikawa',
    kind: 'meme',
    label: 'ちいかわ',
    keys: ['ちいかわ', 'chiikawa', '吉伊卡哇', '吉伊卡娃', 'ハチワレ', '乌萨奇', '烏薩奇'],
    petdex: ['chiikawa', 'jiyi', 'hachiware', 'hachiware-2', 'usagi-2', 'usagi-4'],
  },
  {
    id: 'line-puppy',
    kind: 'meme',
    label: '线条小狗',
    keys: ['线条小狗', '線條小狗', 'maltese line puppy'],
    petdex: ['line-dog', 'line-puppy', 'maltese-codex'],
  },
  {
    id: 'zanmang-loopy',
    kind: 'meme',
    label: 'Zanmang Loopy',
    keys: ['zanmang loopy', '잔망루피', '赞萌露比', ['loopy', '露比'], ['loopy', '表情包']],
    petdex: ['loopy'],
  },
  {
    id: 'butterbear',
    kind: 'meme',
    label: '黄油小熊',
    keys: ['黄油小熊', '黃油小熊', 'butterbear', 'butter bear', 'หมีเนย'],
    petdex: ['butter-bear', 'buttery'],
  },
  {
    id: 'lazy-goat',
    kind: 'meme',
    label: '懒羊羊',
    keys: ['懒羊羊', '懶羊羊'],
    petdex: ['lazy-lamb'],
  },
  {
    id: 'sweating-soybean',
    kind: 'meme',
    label: '流汗黄豆',
    keys: ['流汗黄豆', '黄豆表情', '黄豆人'],
    petdex: ['huangdou'],
  },
  {
    id: 'daodun-dog',
    kind: 'meme',
    label: '刀盾狗',
    keys: ['刀盾狗', '我咧个刀盾', '刀盾meme'],
    petdex: ['daodun-dog'],
  },
  {
    id: 'capybara',
    kind: 'meme',
    label: 'Capybara',
    keys: ['capybara', 'カピバラ', '卡皮巴拉', '水豚'],
    petdex: ['kapimaru', 'capy-pixel', 'capybara-lulu', 'lulu-capybara-2'],
  },
  {
    id: 'labubu',
    kind: 'meme',
    label: 'Labubu',
    keys: ['labubu', '拉布布'],
    petdex: ['labubu-classic'],
  },
  {
    id: 'cheems',
    kind: 'meme',
    label: 'Cheems / Doge',
    keys: ['cheems', 'doge meme', 'swole doge', '神烦狗'],
    petdex: ['cheems'],
  },
  {
    id: 'pepe',
    kind: 'meme',
    label: 'Pepe the Frog',
    keys: ['pepe the frog', 'pepe meme', 'sad frog', '悲伤蛙', '悲傷蛙'],
    petdex: ['pepe', 'apupepe'],
  },
  {
    id: 'wojak',
    kind: 'meme',
    label: 'Wojak',
    keys: ['wojak', 'doomer meme'],
    petdex: ['wojak'],
  },
  {
    id: 'skibidi',
    kind: 'meme',
    label: 'Skibidi Toilet',
    keys: ['skibidi'],
    petdex: ['skibidi'],
  },
  {
    id: 'oiia-cat',
    kind: 'meme',
    label: 'OIIA spinning cat',
    keys: ['oiia', 'oiiai', 'oiiaoiia', 'spinning cat meme'],
    petdex: ['oiiai', 'oiioi'],
  },
  {
    id: 'happy-cat',
    kind: 'meme',
    label: 'Happy Happy Happy cat',
    keys: ['happy happy happy cat', 'happy happy happy', 'happy cat meme'],
    petdex: ['happy-cat'],
  },
  {
    id: 'clippy',
    kind: 'meme',
    label: 'Clippy',
    keys: ['clippy'],
    petdex: ['clippy', 'clippy-5', 'clippy-4'],
  },

  // --- Performers and public figures ---------------------------------------------
  {
    id: 'jay-chou',
    kind: 'person',
    label: '周杰伦',
    keys: ['周杰伦', '周杰倫', 'jay chou'],
    petdex: ['jay-chou-q'],
  },
  {
    id: 'gem',
    kind: 'person',
    label: 'G.E.M. 邓紫棋',
    keys: ['邓紫棋', '鄧紫棋', 'g.e.m.'],
    petdex: ['gem-gloria-q', 'gem-gloria', 'gem'],
  },
  {
    id: 'eminem',
    kind: 'person',
    label: 'Eminem',
    keys: ['eminem'],
    petdex: ['eminem-brisk'],
  },
  {
    id: 'kendrick-lamar',
    kind: 'person',
    label: 'Kendrick Lamar',
    keys: ['kendrick lamar'],
    artist: ['kendricklamarvevo'],
    petdex: ['kendrick-superbowl'],
  },
  {
    id: 'ado',
    kind: 'person',
    label: 'Ado',
    // "ado" is an ordinary word in several languages, so only the artist field counts.
    keys: [],
    artist: ['ado'],
    petdex: ['ado'],
  },
  {
    id: 'steve-jobs',
    kind: 'person',
    label: 'Steve Jobs',
    keys: ['steve jobs', '乔布斯', '賈伯斯'],
    petdex: ['steve-jobs'],
  },
  {
    id: 'messi',
    kind: 'person',
    label: 'Lionel Messi',
    keys: ['messi', '梅西'],
    petdex: ['messi'],
  },
];
