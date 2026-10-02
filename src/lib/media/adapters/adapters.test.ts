import { beforeEach, describe, expect, test } from 'vitest';
import { adapterFor } from './index';
import { bilibili } from './bilibili';
import { spotify } from './spotify';
import { parseClock } from './types';
import { youtube } from './youtube';
import { ytmusic } from './ytmusic';

const loc = (href: string) => new URL(href) as unknown as Location;

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('adapterFor', () => {
  test.each([
    ['www.youtube.com', 'youtube'],
    ['m.youtube.com', 'youtube'],
    ['music.youtube.com', 'ytmusic'],
    ['www.bilibili.com', 'bilibili'],
    ['live.bilibili.com', 'bilibili'],
    ['open.spotify.com', 'spotify'],
  ])('%s → %s', (host, id) => {
    expect(adapterFor(host)?.id).toBe(id);
  });

  test.each(['example.com', 'notyoutube.com', 'evilbilibili.com', 'spotify.com'])('%s → generic', (host) => {
    expect(adapterFor(host)).toBeNull();
  });
});

describe('youtube', () => {
  test('reads watch page info and controls', () => {
    document.body.innerHTML = `
      <div id="movie_player"><video class="html5-main-video"></video>
        <a class="ytp-next-button"></a><a class="ytp-prev-button" style="display:none"></a></div>
      <ytd-watch-metadata><h1><yt-formatted-string>YOASOBI「アイドル」 Official Music Video</yt-formatted-string></h1>
        <div id="owner"><div id="channel-name"><a>Ayase / YOASOBI</a></div></div></ytd-watch-metadata>`;
    expect(youtube.findMedia!(document)?.tagName).toBe('VIDEO');
    expect(youtube.info!(document, loc('https://www.youtube.com/watch?v=ZRtdQ81jPUQ'))).toEqual({
      title: 'YOASOBI「アイドル」 Official Music Video',
      artist: 'Ayase / YOASOBI',
      artwork: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/hqdefault.jpg',
    });
    expect(youtube.nextButton!(document)).not.toBeNull();
    expect(youtube.prevButton!(document)).toBeNull(); // hidden
  });

  test('falls back to document title', () => {
    document.title = '(3) Lofi Girl - beats to relax - YouTube';
    expect(youtube.info!(document, loc('https://www.youtube.com/')).title).toBe('Lofi Girl - beats to relax');
  });
});

describe('ytmusic', () => {
  test('reads player bar', () => {
    document.body.innerHTML = `
      <div id="movie_player"><video></video></div>
      <ytmusic-player-bar>
        <img class="image" src="https://lh3.googleusercontent.com/abc=w60-h60-l90-rj">
        <yt-formatted-string class="title">夜に駆ける</yt-formatted-string>
        <span class="byline">YOASOBI • THE BOOK • 2021</span>
        <tp-yt-paper-icon-button class="previous-button"></tp-yt-paper-icon-button>
        <tp-yt-paper-icon-button id="play-pause-button"></tp-yt-paper-icon-button>
        <tp-yt-paper-icon-button class="next-button" aria-disabled="true"></tp-yt-paper-icon-button>
      </ytmusic-player-bar>`;
    const info = ytmusic.info!(document, loc('https://music.youtube.com/watch?v=x'));
    expect(info).toEqual({
      title: '夜に駆ける',
      artist: 'YOASOBI',
      artwork: 'https://lh3.googleusercontent.com/abc=w544-h544-l90-rj',
    });
    expect(ytmusic.findMedia!(document)).not.toBeNull();
    expect(ytmusic.prevButton!(document)).not.toBeNull();
    expect(ytmusic.nextButton!(document)).toBeNull(); // aria-disabled
    expect(ytmusic.playPauseButton!(document)).not.toBeNull();
  });
});

describe('bilibili', () => {
  test('reads video page', () => {
    document.head.innerHTML = '<meta itemprop="image" content="//i0.hdslb.com/bfs/archive/abc.jpg@100w_100h">';
    document.body.innerHTML = `
      <div class="bpx-player-video-wrap"><video></video></div>
      <h1 class="video-title" title="【初音ミク】千本桜【MMD】">【初音ミク】千本桜…</h1>
      <div class="up-detail-top"><a class="up-name"> 某UP主 </a></div>
      <div class="bpx-player-ctrl-next"></div>`;
    expect(bilibili.findMedia!(document)).not.toBeNull();
    expect(bilibili.info!(document, loc('https://www.bilibili.com/video/BV1xx'))).toEqual({
      title: '【初音ミク】千本桜【MMD】',
      artist: '某UP主',
      artwork: 'https://i0.hdslb.com/bfs/archive/abc.jpg',
    });
    expect(bilibili.nextButton!(document)).not.toBeNull();
    expect(bilibili.prevButton!(document)).toBeNull();
    document.head.innerHTML = '';
  });
});

describe('spotify', () => {
  test('reads now playing widget and DOM state', () => {
    document.body.innerHTML = `
      <div data-testid="now-playing-widget">
        <img data-testid="cover-art-image" src="https://i.scdn.co/image/ab67">
        <a data-testid="context-item-info-title">Blinding Lights</a>
        <a data-testid="context-item-info-artist">The Weeknd</a>
      </div>
      <button data-testid="control-button-skip-back"></button>
      <button data-testid="control-button-playpause" aria-label="Pause"></button>
      <button data-testid="control-button-skip-forward"></button>
      <div data-testid="playback-position">1:05</div>
      <div data-testid="playback-duration">3:20</div>`;
    expect(spotify.ignoreDomMedia).toBe(true);
    expect(spotify.info!(document, loc('https://open.spotify.com/'))).toEqual({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      artwork: 'https://i.scdn.co/image/ab67',
    });
    expect(spotify.domState!(document)).toEqual({ playing: true, currentTime: 65, duration: 200, volume: 1, muted: false });
    document.querySelector('[data-testid="control-button-playpause"]')!.setAttribute('aria-label', 'Play');
    expect(spotify.domState!(document)?.playing).toBe(false);
  });

  test('no player → null state', () => {
    expect(spotify.domState!(document)).toBeNull();
  });
});

test('parseClock', () => {
  expect(parseClock('3:45')).toBe(225);
  expect(parseClock('1:02:03')).toBe(3723);
  expect(parseClock('')).toBe(0);
  expect(parseClock('-:--')).toBe(0);
});
