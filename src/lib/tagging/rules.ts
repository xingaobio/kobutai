import type { ContentType, Genre } from '../pack/types';
import type { MediaInfo, Tags } from './types';

const MUSIC_SITES = [
  'music.youtube.com',
  'open.spotify.com',
  'music.163.com',
  'y.qq.com',
  'soundcloud.com',
  'bandcamp.com',
  'music.apple.com',
  'tidal.com',
  'deezer.com',
  'music.amazon.com',
];
const LIVE_SITES = ['live.bilibili.com', 'twitch.tv', 'www.twitch.tv', 'live.douyin.com', 'huya.com', 'www.huya.com', 'douyu.com', 'www.douyu.com'];
const PODCAST_SITES = ['podcasts.apple.com', 'podcasts.google.com', 'xiaoyuzhoufm.com', 'www.xiaoyuzhoufm.com', 'overcast.fm', 'pocketcasts.com'];

const hostMatches = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith('.' + h));

/** Word-ish match for Latin keywords; substring match for CJK. */
function has(text: string, words: readonly string[]): boolean {
  return words.some((w) => {
    if (/[^\x00-\x7f]/.test(w)) return text.includes(w);
    const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
    return re.test(text);
  });
}

const MUSIC_HINTS = [
  'official music video', 'music video', 'official video', 'official audio', 'mv', 'pv', 'm/v', 'lyrics', 'lyric video',
  'audio', 'song', 'cover', 'covered by', 'feat.', 'ft.', 'remix', 'ost', 'soundtrack', 'live performance', 'acoustic',
  'album', 'single', 'playlist', 'mix', 'karaoke', 'instrumental', 'vocaloid', 'beats', 'lofi', 'lo-fi', 'symphony',
  'concerto', 'sonata', 'piano', 'nightcore', 'amv',
  '歌ってみた', '弾いてみた', '演奏してみた', '主題歌', 'オープニング', 'エンディング', 'ボカロ', '初音ミク', '歌',
  '翻唱', '原唱', '歌曲', '音乐', '纯音乐', '钢琴', '演唱', '现场', '单曲', '专辑', '歌词', '动态歌词', 'MV', '伴奏',
];
const PODCAST_HINTS = ['podcast', 'episode', 'ep.', '播客', '电台', 'ポッドキャスト', 'ラジオ'];
const LIVE_HINTS = ['live now', 'livestream', 'live stream', '直播', '生放送', '配信'];

const GENRE_RULES: [Genre, readonly string[]][] = [
  ['lofi', ['lofi', 'lo-fi', 'chillhop', 'beats to relax', 'beats to study', 'study beats', 'chill beats', 'sleep music', 'study music', '学习音乐', '助眠', '作業用bgm', '作業用']],
  ['classical', ['symphony', 'concerto', 'sonata', 'nocturne', 'étude', 'etude', 'prelude', 'fugue', 'orchestra', 'philharmonic', 'beethoven', 'mozart', 'bach', 'chopin', 'debussy', 'tchaikovsky', 'vivaldi', 'liszt', 'rachmaninoff', 'brahms', 'schubert', '交响', '协奏曲', '奏鸣曲', '古典', 'クラシック', '交響曲']],
  ['electronic', ['edm', 'house', 'techno', 'trance', 'dubstep', 'drum and bass', 'dnb', 'synthwave', 'electro', 'future bass', 'hardstyle', 'avicii', 'skrillex', 'deadmau5', 'marshmello', 'alan walker', 'martin garrix', 'kygo', 'zedd', 'porter robinson', '电音', '电子音乐']],
  ['hiphop', ['hip hop', 'hip-hop', 'rap', 'rapper', 'trap', 'drill', 'freestyle', 'cypher', 'eminem', 'drake', 'kendrick lamar', 'travis scott', 'kanye', 'j. cole', '21 savage', 'post malone', 'lil ', '说唱', '饶舌', '中国新说唱', 'ラップ', 'ヒップホップ']],
  ['rock', ['rock', 'metal', 'punk', 'grunge', 'guitar solo', 'nirvana', 'queen', 'linkin park', 'metallica', 'ac/dc', 'foo fighters', 'green day', 'arctic monkeys', 'imagine dragons', 'muse', 'radiohead', 'the beatles', 'led zeppelin', 'guns n', 'bon jovi', 'one ok rock', 'x japan', 'band-maid', '摇滚', '重金属', '乐队', 'ロック', 'バンド', '五月天']],
];

const ANIME_HINTS = [
  'anime', 'opening', 'ending', 'op', 'ed', 'ost', 'amv', 'tv size', 'tvサイズ', 'vocaloid', 'hatsune miku', 'miku', 'utaite',
  'アニメ', 'オープニング', 'エンディング', '主題歌', 'ボカロ', '初音ミク', '歌ってみた', 'ノンクレジット', '劇場版',
  '动漫', '动画', '番剧', '二次元', '初音', '洛天依', '虚拟歌姬', '东方', 'vtuber', 'ホロライブ', 'hololive',
];

const JP_ARTISTS = ['yoasobi', 'ado', 'king gnu', '米津玄師', 'kenshi yonezu', 'lisa', 'aimer', 'vaundy', 'official髭男dism', 'higedan', 'mrs. green apple', 'radwimps', 'yorushika', 'ヨルシカ', 'zutomayo', 'ずっと真夜中でいいのに。', 'eve', 'kana-boon', 'creepy nuts', 'fujii kaze', '藤井風', 'aimyon', 'あいみょん', 'utada hikaru', '宇多田ヒカル', 'perfume', 'babymetal', 'milet', 'reol', 'yuuri', '優里', 'tuki.'];
const ANIME_ARTISTS = ['lisa', 'aimer', 'claris', 'kalafina', 'eir aoi', '藍井エイル', 'supercell', 'mili', 'myth & roid', 'reona', 'linked horizon'];
const CN_ARTISTS = ['周杰伦', 'jay chou', '林俊杰', 'jj lin', '邓紫棋', 'g.e.m.', '陈奕迅', 'eason chan', '薛之谦', '毛不易', '李荣浩', '王菲', '蔡依林', '孙燕姿', '张学友', '五月天', '华晨宇', '周深', '告五人', '张惠妹', '汪苏泷', '许嵩', '王力宏', '陶喆', '梁静茹', '莫文蔚'];
const WESTERN_ARTISTS = ['taylor swift', 'the weeknd', 'ed sheeran', 'billie eilish', 'dua lipa', 'ariana grande', 'justin bieber', 'bruno mars', 'olivia rodrigo', 'harry styles', 'adele', 'lady gaga', 'katy perry', 'rihanna', 'beyoncé', 'beyonce', 'sabrina carpenter', 'charlie puth', 'shawn mendes', 'sia', 'coldplay', 'maroon 5', 'one direction', 'selena gomez', 'miley cyrus', 'doja cat', 'sza', 'lana del rey', 'chappell roan'];

const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;
const HANGUL = /[가-힯]/;

function detectType(info: MediaInfo, text: string): ContentType {
  const host = info.site.toLowerCase();
  if (hostMatches(host, PODCAST_SITES) || has(text, PODCAST_HINTS)) return 'podcast';
  if (hostMatches(host, LIVE_SITES) || has(text, LIVE_HINTS)) return 'live';
  if (hostMatches(host, MUSIC_SITES)) return 'music';
  const artist = info.artist.toLowerCase();
  // YouTube auto-generated music channels and label channels.
  if (/ - topic$/.test(artist) || /vevo$/.test(artist) || /official髭男dism|records|music$/.test(artist)) return 'music';
  if (has(text, MUSIC_HINTS)) return 'music';
  if ([...JP_ARTISTS, ...CN_ARTISTS, ...WESTERN_ARTISTS, ...ANIME_ARTISTS].some((a) => has(artist, [a]))) return 'music';
  // A genre keyword or well-known act in the channel/artist name (e.g. "Linkin Park", "Alan Walker").
  if (GENRE_RULES.some(([, words]) => has(artist, words))) return 'music';
  // 「Song」/『Song』 quoting is a strong J-music convention.
  if (/[「『【].+[」』】]/.test(info.title) && KANA.test(text)) return 'music';
  return 'video';
}

function detectGenre(info: MediaInfo, text: string): Genre {
  for (const [genre, words] of GENRE_RULES) if (has(text, words)) return genre;
  const artist = info.artist.toLowerCase();
  if (has(text, ANIME_HINTS) || ANIME_ARTISTS.some((a) => has(artist, [a]))) return 'anime';
  if (JP_ARTISTS.some((a) => has(artist, [a]) || has(text, [a])) || KANA.test(text)) return 'jpop';
  if (CN_ARTISTS.some((a) => has(text, [a])) || (HAN.test(text) && !KANA.test(text))) return 'cpop';
  if (HANGUL.test(text)) return 'other';
  if (WESTERN_ARTISTS.some((a) => has(text, [a])) || /^[\x00-\x7fÀ-ɏ\s\p{P}]+$/u.test(text)) return 'western-pop';
  return 'other';
}

/** Offline, deterministic tagging from title / artist / site. */
export function ruleTags(info: MediaInfo): Tags {
  const text = `${info.title} ${info.artist}`.toLowerCase();
  const type = detectType(info, text);
  return { type, genre: type === 'music' ? detectGenre(info, text) : null, source: 'rules' };
}
