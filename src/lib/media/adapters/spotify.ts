import { absUrl, clickable, parseClock, text, type SiteAdapter } from './types';

const PAUSE_LABEL = /pause|暂停|一時停止|pausar|pausieren/i;

export const spotify: SiteAdapter = {
  id: 'spotify',
  match: (host) => host === 'open.spotify.com',
  // Spotify plays through a media element that is never attached to the DOM;
  // the main-world hook reports it as "detached" media.
  ignoreDomMedia: true,
  info(doc, loc) {
    const widget = doc.querySelector('[data-testid="now-playing-widget"]') ?? doc;
    const artists = [...widget.querySelectorAll('[data-testid="context-item-info-artist"]')]
      .map((a) => a.textContent?.trim() ?? '')
      .filter(Boolean);
    const img = widget.querySelector<HTMLImageElement>('img[data-testid="cover-art-image"], img');
    return {
      title: text(widget, '[data-testid="context-item-info-title"]') || text(widget, '[data-testid="context-item-link"]'),
      artist: artists.join(', '),
      artwork: absUrl(img?.getAttribute('src'), loc.href),
    };
  },
  nextButton: (doc) => clickable(doc.querySelector('[data-testid="control-button-skip-forward"]')),
  prevButton: (doc) => clickable(doc.querySelector('[data-testid="control-button-skip-back"]')),
  playPauseButton: (doc) => clickable(doc.querySelector('[data-testid="control-button-playpause"]')),
  domState(doc) {
    const btn = doc.querySelector('[data-testid="control-button-playpause"]');
    if (!btn) return null;
    return {
      playing: PAUSE_LABEL.test(btn.getAttribute('aria-label') ?? ''),
      currentTime: parseClock(text(doc, '[data-testid="playback-position"]')),
      duration: parseClock(text(doc, '[data-testid="playback-duration"]')),
      volume: 1,
      muted: false,
    };
  },
};
