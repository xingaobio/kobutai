import { absUrl, clickable, text, type SiteAdapter } from './types';

export const ytmusic: SiteAdapter = {
  id: 'ytmusic',
  match: (host) => host === 'music.youtube.com',
  findMedia: (doc) => doc.querySelector<HTMLVideoElement>('#movie_player video') ?? doc.querySelector('video'),
  info(doc, loc) {
    const bar = doc.querySelector('ytmusic-player-bar');
    if (!bar) return {};
    // Byline reads "Artist • Album • Year"; the artist is the first segment.
    const artist = text(bar, '.byline').split('•')[0]?.trim() ?? '';
    const img = bar.querySelector<HTMLImageElement>('img.image, .thumbnail img');
    const artwork = absUrl(img?.getAttribute('src'), loc.href).replace(/=w\d+-h\d+/, '=w544-h544');
    return { title: text(bar, '.title'), artist, artwork };
  },
  nextButton: (doc) => clickable(doc.querySelector('ytmusic-player-bar .next-button')),
  prevButton: (doc) => clickable(doc.querySelector('ytmusic-player-bar .previous-button')),
  playPauseButton: (doc) => clickable(doc.querySelector('ytmusic-player-bar #play-pause-button')),
};
