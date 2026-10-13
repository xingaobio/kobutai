import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ATTR_ACTIONS, ATTR_DETACHED, ATTR_META, CMD_EVENT } from './bridge';
import { PageMediaController } from './controller';
import { spotify } from './adapters/spotify';
import { youtube } from './adapters/youtube';

const loc = (href: string) => new URL(href) as unknown as Location;

/** happy-dom media elements don't play; give them controllable state. */
function fakeMedia(tag: 'video' | 'audio', init: { paused?: boolean; duration?: number; muted?: boolean } = {}) {
  const el = document.createElement(tag);
  el.src = 'https://example.com/a.mp4';
  let paused = init.paused ?? true;
  Object.defineProperty(el, 'paused', { get: () => paused });
  Object.defineProperty(el, 'duration', { get: () => init.duration ?? 100 });
  el.muted = init.muted ?? false;
  el.play = vi.fn(async () => {
    paused = false;
    el.dispatchEvent(new Event('play'));
  });
  el.pause = vi.fn(() => {
    paused = true;
  });
  document.body.append(el);
  return el;
}

function bridgeCommands() {
  const cmds: unknown[] = [];
  document.addEventListener(CMD_EVENT, (e) => cmds.push(JSON.parse((e as CustomEvent).detail)));
  return cmds;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = 'Page';
  for (const a of [ATTR_ACTIONS, ATTR_META, ATTR_DETACHED]) document.documentElement.removeAttribute(a);
});

describe('generic', () => {
  test('an endless duration is reported as a live stream', async () => {
    await fakeMedia('video', { duration: Infinity }).play();
    const s = new PageMediaController(document, loc('https://example.com/'), null).snapshot();
    expect(s).toMatchObject({ playing: true, duration: 0, canSeek: false, live: true });
  });

  test('a finite duration is not live', async () => {
    await fakeMedia('audio', { duration: 200 }).play();
    const s = new PageMediaController(document, loc('https://example.com/'), null).snapshot();
    expect(s).toMatchObject({ playing: true, duration: 200 });
    expect(s?.live).toBeUndefined();
  });

  test('no media → null snapshot', () => {
    expect(new PageMediaController(document, loc('https://example.com/'), null).snapshot()).toBeNull();
  });

  test('snapshot from element + session metadata', () => {
    const el = fakeMedia('audio', { duration: 200 });
    el.currentTime = 12;
    document.documentElement.setAttribute(ATTR_META, JSON.stringify({ title: 'Song', artist: 'Band', album: '', artwork: 'https://x/a.jpg' }));
    document.documentElement.setAttribute(ATTR_ACTIONS, 'nexttrack,play,pause');
    const c = new PageMediaController(document, loc('https://example.com/'), null);
    expect(c.snapshot()).toMatchObject({
      playing: false,
      currentTime: 12,
      duration: 200,
      title: 'Song',
      artist: 'Band',
      artwork: 'https://x/a.jpg',
      canNext: true,
      canPrev: false,
      canSeek: true,
      adapter: 'generic',
      site: 'example.com',
    });
  });

  test('ignores the mascot\'s own video', () => {
    const own = fakeMedia('video');
    own.dataset.happydesk = 'true';
    expect(new PageMediaController(document, loc('https://e.com/'), null).snapshot()).toBeNull();
  });

  test('prefers the last played element', async () => {
    fakeMedia('video', { paused: false });
    const b = fakeMedia('audio');
    const c = new PageMediaController(document, loc('https://e.com/'), null);
    await b.play();
    expect(c.media()).toBe(b);
  });

  test('untouched media is not reported', () => {
    fakeMedia('audio');
    expect(new PageMediaController(document, loc('https://e.com/'), null).snapshot()).toBeNull();
  });

  test('commands drive the element', () => {
    const el = fakeMedia('video');
    el.currentTime = 1;
    const c = new PageMediaController(document, loc('https://e.com/'), null);
    c.run({ type: 'toggle' });
    expect(el.play).toHaveBeenCalled();
    c.run({ type: 'seek', time: 42 });
    expect(el.currentTime).toBe(42);
    c.run({ type: 'volume', volume: 1.5 });
    expect(el.volume).toBe(1);
    c.run({ type: 'mute', muted: true });
    expect(el.muted).toBe(true);
    c.run({ type: 'pause' });
    expect(el.pause).toHaveBeenCalled();
  });

  test('next uses the Media Session handler when there is no site button', () => {
    fakeMedia('audio');
    document.documentElement.setAttribute(ATTR_ACTIONS, 'nexttrack');
    const cmds = bridgeCommands();
    new PageMediaController(document, loc('https://e.com/'), null).run({ type: 'next' });
    expect(cmds).toEqual([{ target: 'session', action: 'nexttrack' }]);
  });
});

test('page artwork must be https or inline image', () => {
  fakeMedia('audio', { paused: false });
  const c = new PageMediaController(document, loc('https://e.com/'), null);
  for (const [art, ok] of [
    ['http://tracker.test/p.png', false],
    ['javascript:alert(1)', false],
    ['data:text/html,x', false],
    ['https://cdn.test/a.jpg', true],
    ['data:image/png;base64,AAAA', true],
  ] as const) {
    document.documentElement.setAttribute(ATTR_META, JSON.stringify({ title: 't', artist: '', album: '', artwork: art }));
    expect(c.snapshot()?.artwork).toBe(ok ? art : undefined);
  }
});

describe('detached media (Spotify)', () => {
  test('snapshot and commands go through the bridge', () => {
    document.documentElement.setAttribute(
      ATTR_DETACHED,
      JSON.stringify({ playing: true, currentTime: 5, duration: 180, volume: 0.5, muted: false }),
    );
    document.documentElement.setAttribute(ATTR_ACTIONS, 'play,pause,seekto');
    // Spotify's muted Canvas video must be ignored.
    fakeMedia('video', { paused: false, muted: true });
    const cmds = bridgeCommands();
    const c = new PageMediaController(document, loc('https://open.spotify.com/'), spotify);
    expect(c.snapshot()).toMatchObject({ playing: true, duration: 180, volume: 0.5, adapter: 'spotify', canSeek: true });
    c.run({ type: 'toggle' });
    c.run({ type: 'seek', time: 30 });
    c.run({ type: 'volume', volume: 0.2 });
    expect(cmds).toEqual([
      { target: 'session', action: 'pause' },
      { target: 'session', action: 'seekto', seekTime: 30 },
      { target: 'detached', op: 'volume', value: 0.2 },
    ]);
  });

  test('falls back to DOM state and buttons', () => {
    document.body.innerHTML = `
      <button data-testid="control-button-playpause" aria-label="Play"></button>
      <button data-testid="control-button-skip-forward"></button>
      <div data-testid="playback-position">0:10</div><div data-testid="playback-duration">2:00</div>`;
    const c = new PageMediaController(document, loc('https://open.spotify.com/'), spotify);
    const snap = c.snapshot();
    expect(snap).toMatchObject({ playing: false, duration: 120, canNext: true, canSeek: false });
    const play = vi.fn();
    const next = vi.fn();
    document.querySelector('[data-testid="control-button-playpause"]')!.addEventListener('click', play);
    document.querySelector('[data-testid="control-button-skip-forward"]')!.addEventListener('click', next);
    c.run({ type: 'play' });
    c.run({ type: 'pause' }); // already paused → no click
    c.run({ type: 'next' });
    expect(play).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('site adapter', () => {
  test('youtube uses the main player and its next button', () => {
    document.body.innerHTML = `<div id="movie_player"><a class="ytp-next-button"></a></div>`;
    const main = fakeMedia('video');
    main.className = 'html5-main-video';
    document.querySelector('#movie_player')!.append(main);
    fakeMedia('video', { paused: false }); // some other playing video
    const next = vi.fn();
    document.querySelector('.ytp-next-button')!.addEventListener('click', next);
    const c = new PageMediaController(document, loc('https://www.youtube.com/watch?v=abc'), youtube);
    expect(c.media()).toBe(main);
    c.run({ type: 'next' });
    expect(next).toHaveBeenCalled();
    expect(c.snapshot()?.artwork).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
  });
});
