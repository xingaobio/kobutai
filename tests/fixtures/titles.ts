import type { ContentType, Genre } from '../../src/lib/pack/types';

/** Realistic titles with the tags a human would assign. Used to measure tagger accuracy. */
export const TITLE_CASES: { site: string; title: string; artist: string; type: ContentType; genre: Genre | null }[] = [
  // J-pop / anime
  { site: 'www.youtube.com', title: 'YOASOBI「アイドル」 Official Music Video', artist: 'Ayase / YOASOBI', type: 'music', genre: 'anime' },
  { site: 'www.youtube.com', title: '米津玄師 - Lemon', artist: '米津玄師', type: 'music', genre: 'jpop' },
  { site: 'www.youtube.com', title: 'Ado「唱」MUSIC VIDEO', artist: 'Ado', type: 'music', genre: 'jpop' },
  { site: 'www.youtube.com', title: 'TVアニメ「呪術廻戦」第2期 OPテーマ 青のすみか', artist: 'TOHO animation チャンネル', type: 'music', genre: 'anime' },
  { site: 'www.youtube.com', title: '【歌ってみた】シャルル / 星街すいせい', artist: 'Suisei Channel', type: 'music', genre: 'anime' },
  { site: 'music.youtube.com', title: '夜に駆ける', artist: 'YOASOBI', type: 'music', genre: 'jpop' },
  { site: 'open.spotify.com', title: 'Pretender', artist: 'Official髭男dism', type: 'music', genre: 'jpop' },
  { site: 'www.bilibili.com', title: '【初音ミク】千本桜【MMD】', artist: 'MMD制作组', type: 'music', genre: 'anime' },
  { site: 'www.youtube.com', title: 'Chainsaw Man - Opening | KICK BACK', artist: 'Crunchyroll', type: 'music', genre: 'anime' },
  { site: 'www.youtube.com', title: 'ヨルシカ - ただ君に晴れ (MUSIC VIDEO)', artist: 'ヨルシカ / n-buna Official', type: 'music', genre: 'jpop' },
  // C-pop
  { site: 'www.bilibili.com', title: '周杰伦《晴天》4K修复版MV', artist: '周杰伦', type: 'music', genre: 'cpop' },
  { site: 'music.163.com', title: '孤勇者', artist: '陈奕迅', type: 'music', genre: 'cpop' },
  { site: 'www.bilibili.com', title: '【翻唱】起风了 - 女声温柔版', artist: '某某UP', type: 'music', genre: 'cpop' },
  { site: 'open.spotify.com', title: '光年之外', artist: 'G.E.M. 邓紫棋', type: 'music', genre: 'cpop' },
  // Western pop
  { site: 'www.youtube.com', title: 'Taylor Swift - Anti-Hero (Official Music Video)', artist: 'Taylor Swift', type: 'music', genre: 'western-pop' },
  { site: 'open.spotify.com', title: 'Blinding Lights', artist: 'The Weeknd', type: 'music', genre: 'western-pop' },
  { site: 'www.youtube.com', title: 'Billie Eilish - BIRDS OF A FEATHER (Official Music Video)', artist: 'BillieEilishVEVO', type: 'music', genre: 'western-pop' },
  { site: 'music.youtube.com', title: 'Espresso', artist: 'Sabrina Carpenter', type: 'music', genre: 'western-pop' },
  { site: 'www.youtube.com', title: 'Dua Lipa - Houdini (Official Music Video)', artist: 'Dua Lipa', type: 'music', genre: 'western-pop' },
  // Hip-hop
  { site: 'www.youtube.com', title: 'Kendrick Lamar - Not Like Us', artist: 'KendrickLamarVEVO', type: 'music', genre: 'hiphop' },
  { site: 'open.spotify.com', title: 'Lose Yourself', artist: 'Eminem', type: 'music', genre: 'hiphop' },
  { site: 'www.bilibili.com', title: '【中国新说唱】GAI《火锅底料》现场', artist: '爱奇艺说唱', type: 'music', genre: 'hiphop' },
  // Rock
  { site: 'www.youtube.com', title: 'Linkin Park - Numb (Official Music Video) [4K UPGRADE]', artist: 'Linkin Park', type: 'music', genre: 'rock' },
  { site: 'open.spotify.com', title: 'Bohemian Rhapsody', artist: 'Queen', type: 'music', genre: 'rock' },
  { site: 'www.youtube.com', title: 'ONE OK ROCK - The Beginning [Official Music Video]', artist: 'ONE OK ROCK', type: 'music', genre: 'rock' },
  // Electronic
  { site: 'www.youtube.com', title: 'Alan Walker - Faded', artist: 'Alan Walker', type: 'music', genre: 'electronic' },
  { site: 'soundcloud.com', title: 'Deep House Mix 2024 | Best of Vocal House', artist: 'Mr. Mix', type: 'music', genre: 'electronic' },
  // Lo-fi
  { site: 'www.youtube.com', title: 'lofi hip hop radio 📚 beats to relax/study to', artist: 'Lofi Girl', type: 'music', genre: 'lofi' },
  { site: 'www.bilibili.com', title: '【作業用BGM】3小时 学习音乐 | 放松专注', artist: '音乐UP', type: 'music', genre: 'lofi' },
  // Classical
  { site: 'www.youtube.com', title: 'Chopin - Nocturne Op. 9 No. 2', artist: 'Rousseau', type: 'music', genre: 'classical' },
  { site: 'music.youtube.com', title: 'Symphony No. 5 in C Minor, Op. 67: I. Allegro con brio', artist: 'Berliner Philharmoniker', type: 'music', genre: 'classical' },
  // Video (not music)
  { site: 'www.youtube.com', title: 'How Transformers Work - A Visual Guide', artist: '3Blue1Brown', type: 'video', genre: null },
  { site: 'www.youtube.com', title: 'I Built a Secret Room in My House', artist: 'MrBeast', type: 'video', genre: null },
  { site: 'www.bilibili.com', title: '【何同学】我做了一个苹果做不到的产品', artist: '老师好我叫何同学', type: 'video', genre: null },
  { site: 'www.youtube.com', title: 'iPhone 17 Pro Review: Two Weeks Later', artist: 'Marques Brownlee', type: 'video', genre: null },
  { site: 'www.bilibili.com', title: '十分钟看完《流浪地球2》', artist: '电影解说君', type: 'video', genre: null },
  { site: 'www.youtube.com', title: 'Python Tutorial for Beginners - Full Course', artist: 'freeCodeCamp.org', type: 'video', genre: null },
  // Live
  { site: 'live.bilibili.com', title: '晚间杂谈 来聊天', artist: '某主播', type: 'live', genre: null },
  { site: 'www.twitch.tv', title: 'ranked grind !discord', artist: 'shroud', type: 'live', genre: null },
  // Podcast
  { site: 'www.youtube.com', title: 'Lex Fridman Podcast #400 – Elon Musk', artist: 'Lex Fridman', type: 'podcast', genre: null },
  { site: 'www.xiaoyuzhoufm.com', title: 'E120 聊聊三十岁这件事', artist: '某播客', type: 'podcast', genre: null },
];
