import { clickable, text, type SiteAdapter } from './types';

export const youtube: SiteAdapter = {
  id: 'youtube',
  match: (host) => host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com',
  findMedia: (doc) =>
    doc.querySelector<HTMLVideoElement>('#movie_player video.html5-main-video') ??
    doc.querySelector<HTMLVideoElement>('video.html5-main-video'),
  info(doc, loc) {
    const title =
      text(doc, 'ytd-watch-metadata h1 yt-formatted-string') ||
      text(doc, 'h1.ytd-watch-metadata') ||
      doc.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '');
    const artist = text(doc, 'ytd-watch-metadata #owner #channel-name a') || text(doc, '#owner #channel-name a');
    const id = new URLSearchParams(loc.search).get('v');
    return { title, artist, artwork: id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : '' };
  },
  nextButton: (doc) => clickable(doc.querySelector('#movie_player .ytp-next-button')),
  prevButton: (doc) => clickable(doc.querySelector('#movie_player .ytp-prev-button')),
};
