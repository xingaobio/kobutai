import { absUrl, clickable, text, type SiteAdapter } from './types';

export const bilibili: SiteAdapter = {
  id: 'bilibili',
  match: (host) => host === 'bilibili.com' || host.endsWith('.bilibili.com'),
  findMedia: (doc) =>
    doc.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video') ??
    doc.querySelector<HTMLVideoElement>('#bilibili-player video'),
  info(doc, loc) {
    const h1 = doc.querySelector('h1.video-title');
    const title = h1?.getAttribute('title')?.trim() || text(doc, 'h1.video-title') || doc.title.replace(/_哔哩哔哩.*$/, '');
    const artist = text(doc, '.up-detail-top .up-name') || text(doc, '.up-name');
    const img =
      doc.querySelector('meta[itemprop="image"]')?.getAttribute('content') ??
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    return { title, artist, artwork: absUrl(img?.replace(/@.*$/, ''), loc.href) };
  },
  nextButton: (doc) => clickable(doc.querySelector('.bpx-player-ctrl-next')),
  prevButton: (doc) => clickable(doc.querySelector('.bpx-player-ctrl-prev')),
};
