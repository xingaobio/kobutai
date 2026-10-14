import { describe, expect, test, vi } from 'vitest';
import { Hub } from '@/lib/hub';
import type { ToBackground } from '@/lib/messages';
import { entryKey } from '@/lib/registry';
import {
  COMMAND_CMD,
  SESSIONS_CMD,
  SESSIONS_EVENT,
  commandOf,
  connectSessions,
  siteFor,
  snapshotOf,
  stableHash,
  type DesktopSession,
  type SessionsIo,
  type SessionsPayload,
} from './sessions';

const session = (id: string, over: Partial<DesktopSession> = {}): DesktopSession => ({
  id,
  title: 'Song',
  artist: 'Artist',
  albumTitle: 'Album',
  playing: true,
  position: 12.5,
  duration: 200,
  canPlay: true,
  canPause: true,
  canNext: true,
  canPrev: false,
  canSeek: true,
  ...over,
});

describe('siteFor (the app → pseudo-site table)', () => {
  test.each([
    ['Spotify.exe', 'open.spotify.com'],
    ['SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'open.spotify.com'],
    ['AppleInc.AppleMusicWin_nzyj5cx40ttqa!App', 'music.apple.com'],
    ['iTunes.exe', 'music.apple.com'],
    ['cloudmusic.exe', 'music.163.com'],
    ['QQMusic.exe', 'y.qq.com'],
    ['KuGou.exe', 'www.kugou.com'],
    ['Chrome', 'chrome'],
    ['MSEdge', 'msedge'],
    ['C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'vlc'],
    ['/usr/bin/Foo.EXE', 'foo'],
    ['Firefox.exe', 'firefox'],
  ])('%s → %s', (id, site) => {
    expect(siteFor(id)).toBe(site);
  });

  test('matching is case-insensitive and by containment', () => {
    expect(siteFor('SPOTIFY')).toBe('open.spotify.com');
    expect(siteFor('com.foo.MyCloudMusic.exe')).toBe('music.163.com');
  });

  test('an empty id still gives a site', () => {
    expect(siteFor('')).toBe('unknown');
  });
});

describe('snapshotOf', () => {
  test('maps the fields as the spec says', () => {
    expect(snapshotOf(session('Spotify.exe'))).toEqual({
      playing: true,
      currentTime: 12.5,
      duration: 200,
      volume: 1,
      muted: false,
      canVolume: false,
      title: 'Song',
      artist: 'Artist',
      canNext: true,
      canPrev: false,
      canSeek: true,
      adapter: 'smtc',
      site: 'open.spotify.com',
    });
  });

  test('odd numbers become 0', () => {
    const s = snapshotOf(session('x', { position: NaN, duration: Infinity }));
    expect([s.currentTime, s.duration]).toEqual([0, 0]);
    expect(snapshotOf(session('x', { position: -3 })).currentTime).toBe(0);
  });
});

describe('commandOf', () => {
  test('play / pause / toggle / next / prev / seek pass through', () => {
    for (const type of ['play', 'pause', 'toggle', 'next', 'prev'] as const) expect(commandOf({ type })).toEqual({ type });
    expect(commandOf({ type: 'seek', time: 42.5 })).toEqual({ type: 'seek', time: 42.5 });
  });
  test('volume and mute are dropped', () => {
    expect(commandOf({ type: 'volume', volume: 0.5 })).toBeNull();
    expect(commandOf({ type: 'mute', muted: true })).toBeNull();
  });
});

describe('stableHash', () => {
  test('is stable, non-negative and fits 31 bits', () => {
    expect(stableHash('Spotify.exe')).toBe(stableHash('Spotify.exe'));
    expect(stableHash('Spotify.exe')).not.toBe(stableHash('Chrome'));
    for (const id of ['', 'a', 'Spotify.exe', '日本語', 'x'.repeat(500)]) {
      const h = stableHash(id);
      expect(Number.isInteger(h) && h >= 0 && h <= 0x7fffffff).toBe(true);
    }
  });
});

/** A fake Tauri: listen/invoke with controllable events, plus a real hub. */
function setup(initial: SessionsPayload | Error = { sessions: [], currentId: null }) {
  const hub = new Hub(() => clock.now);
  const clock = { now: 1_000 };
  let emit: (p: SessionsPayload) => void = () => {};
  const unlisten = vi.fn();
  const invoke = vi.fn(async (cmd: string, _args?: Record<string, unknown>) => {
    if (cmd === SESSIONS_CMD) {
      if (initial instanceof Error) throw initial;
      return initial;
    }
    return undefined;
  });
  const listen = vi.fn(async (event: string, cb: (p: SessionsPayload) => void) => {
    expect(event).toBe(SESSIONS_EVENT);
    emit = cb;
    return unlisten;
  });
  const io: SessionsIo = { listen, invoke };
  const states: Array<ReturnType<Hub['registry']['state']>> = [];
  const toHub: Array<(m: ToBackground) => void> = [];
  hub.connectViewer({
    postMessage: (m) => m.t === 'state' && states.push(m.state),
    onMessage: { addListener: (fn) => void toHub.push(fn) },
    onDisconnect: { addListener: () => {} },
  });
  const handle = connectSessions(hub, io);
  return {
    hub,
    handle,
    invoke,
    listen,
    unlisten,
    clock,
    emit: (p: SessionsPayload) => emit(p),
    send: (m: ToBackground) => toHub.forEach((f) => f(m)),
    last: () => states.at(-1)!,
  };
}

describe('connectSessions', () => {
  test('subscribes first, then pulls the current sessions once', async () => {
    const t = setup({ sessions: [session('Spotify.exe')], currentId: 'Spotify.exe' });
    await t.handle.ready;
    expect(t.listen).toHaveBeenCalledOnce();
    expect(t.invoke).toHaveBeenCalledWith(SESSIONS_CMD);
    expect(t.hub.registry.state().entries).toHaveLength(1);
    expect(t.hub.registry.primary()?.snapshot.site).toBe('open.spotify.com');
  });

  test('an event that beats the initial pull wins over it', async () => {
    const t = setup({ sessions: [session('Old.exe', { title: 'old' })], currentId: null });
    // The event arrives before the invoke answer is processed.
    await Promise.resolve();
    await Promise.resolve();
    t.emit({ sessions: [session('New.exe', { title: 'new' })], currentId: null });
    await t.handle.ready;
    expect(t.hub.registry.state().entries.map((e) => e.snapshot.title)).toEqual(['new']);
  });

  test('an empty initial pull (Rust: manager not connected yet) does not suppress the first event', async () => {
    const t = setup({ sessions: [], currentId: null });
    await t.handle.ready;
    expect(t.hub.registry.state().entries).toEqual([]);
    t.emit({ sessions: [session('Spotify.exe')], currentId: 'Spotify.exe' });
    expect(t.hub.registry.primary()?.snapshot.title).toBe('Song');
    // And the position is taken as sent: Rust already extrapolated it, nothing adds to it here.
    expect(t.hub.registry.primary()?.snapshot.currentTime).toBe(12.5);
  });

  test('a failing initial pull is only logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup(new Error('no manager'));
    await t.handle.ready;
    expect(warn).toHaveBeenCalled();
    t.emit({ sessions: [session('A')], currentId: null });
    expect(t.hub.registry.state().entries).toHaveLength(1);
    warn.mockRestore();
  });

  test('a session appears, updates, and disappears', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('Spotify.exe', { position: 1 })], currentId: 'Spotify.exe' });
    const key = entryKey(stableHash('Spotify.exe'), 0);
    expect(t.hub.registry.get(key)?.snapshot).toMatchObject({ currentTime: 1, playing: true, adapter: 'smtc' });
    expect(t.last().primary?.key).toBe(key);

    t.clock.now += 1000;
    t.emit({ sessions: [session('Spotify.exe', { position: 2, title: 'Next song' })], currentId: 'Spotify.exe' });
    expect(t.hub.registry.get(key)?.snapshot).toMatchObject({ currentTime: 2, title: 'Next song' });
    expect(t.hub.registry.state().entries).toHaveLength(1);

    t.emit({ sessions: [], currentId: null });
    expect(t.hub.registry.get(key)).toBeUndefined();
    expect(t.hub.registry.primary()).toBeNull();
    expect(t.last().entries).toEqual([]);
  });

  test('every session gets its own entry with a tab id from the hash and frame 0', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('Spotify.exe'), session('Chrome', { playing: false })], currentId: null });
    const keys = t.hub.registry.state().entries.map((e) => e.key).sort();
    expect(keys).toEqual([entryKey(stableHash('Spotify.exe'), 0), entryKey(stableHash('Chrome'), 0)].sort());
    // Only one goes away.
    t.emit({ sessions: [session('Chrome', { playing: false })], currentId: null });
    expect(t.hub.registry.state().entries.map((e) => e.key)).toEqual([entryKey(stableHash('Chrome'), 0)]);
  });

  test('a session that comes back is a fresh connection', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('A')], currentId: null });
    t.emit({ sessions: [], currentId: null });
    t.emit({ sessions: [session('A', { title: 'again' })], currentId: null });
    expect(t.hub.registry.primary()?.snapshot.title).toBe('again');
  });

  test('the most recently started session is primary (the hub decides)', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('A'), session('B', { playing: false })], currentId: 'A' });
    expect(t.hub.registry.primary()?.snapshot.site).toBe('a');
    t.clock.now += 5000;
    t.emit({ sessions: [session('A'), session('B', { playing: true })], currentId: 'A' });
    expect(t.hub.registry.primary()?.snapshot.site).toBe('b');
  });

  test('sessions that all start at once: the system current session decides', async () => {
    const t = setup();
    await t.handle.ready;
    // Without a hint the hub would pick the last one (same start time, latest report).
    t.emit({ sessions: [session('First'), session('Second'), session('Third')], currentId: 'Second' });
    expect(t.hub.registry.primary()?.snapshot.site).toBe('second');
    // A later start elsewhere overrides the hint, as a manual pick is overridden.
    t.clock.now += 5000;
    t.emit({
      sessions: [session('First', { playing: false }), session('Second'), session('Third'), session('Fourth')],
      currentId: 'Second',
    });
    expect(t.hub.registry.primary()?.snapshot.site).toBe('fourth');
  });

  test('the hint is ignored for a lone start and when the current session is not playing', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('A', { playing: false }), session('B', { playing: false })], currentId: 'A' });
    t.clock.now += 100;
    t.emit({ sessions: [session('A', { playing: false }), session('B')], currentId: 'A' });
    expect(t.hub.registry.primary()?.snapshot.site).toBe('b');
  });

  test('a pick from the overlay (select) still works on top of it', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('A'), session('B')], currentId: null });
    const a = entryKey(stableHash('A'), 0);
    t.send({ t: 'select', key: a });
    expect(t.hub.registry.primary()?.key).toBe(a);
    t.emit({ sessions: [session('A', { position: 50 }), session('B', { position: 50 })], currentId: null });
    expect(t.hub.registry.primary()?.key).toBe(a);
  });

  describe('commands', () => {
    test('go to the session the hub targets, mapped to the contract', async () => {
      const t = setup();
      await t.handle.ready;
      t.emit({ sessions: [session('Spotify.exe')], currentId: null });
      const key = entryKey(stableHash('Spotify.exe'), 0);

      t.send({ t: 'command', key, cmd: { type: 'next' } });
      t.send({ t: 'command', cmd: { type: 'pause' } }); // no key: the primary
      t.send({ t: 'command', key, cmd: { type: 'seek', time: 61 } });
      await Promise.resolve();

      const calls = t.invoke.mock.calls.filter(([c]) => c === COMMAND_CMD).map(([, a]) => a);
      expect(calls).toEqual([
        { id: 'Spotify.exe', cmd: { type: 'next' } },
        { id: 'Spotify.exe', cmd: { type: 'pause' } },
        { id: 'Spotify.exe', cmd: { type: 'seek', time: 61 } },
      ]);
    });

    test('are routed by session when several play', async () => {
      const t = setup();
      await t.handle.ready;
      t.emit({ sessions: [session('A'), session('B')], currentId: null });
      t.send({ t: 'command', key: entryKey(stableHash('A'), 0), cmd: { type: 'toggle' } });
      t.send({ t: 'command', key: entryKey(stableHash('B'), 0), cmd: { type: 'prev' } });
      const calls = t.invoke.mock.calls.filter(([c]) => c === COMMAND_CMD).map(([, a]) => a);
      expect(calls).toEqual([
        { id: 'A', cmd: { type: 'toggle' } },
        { id: 'B', cmd: { type: 'prev' } },
      ]);
    });

    test('volume and mute are never sent', async () => {
      const t = setup();
      await t.handle.ready;
      t.emit({ sessions: [session('A')], currentId: null });
      t.send({ t: 'command', cmd: { type: 'volume', volume: 0.2 } });
      t.send({ t: 'command', cmd: { type: 'mute', muted: true } });
      expect(t.invoke.mock.calls.filter(([c]) => c === COMMAND_CMD)).toEqual([]);
    });

    test('a rejected command is only logged', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const t = setup();
      await t.handle.ready;
      t.emit({ sessions: [session('A')], currentId: null });
      t.invoke.mockImplementationOnce(async () => {
        throw 'session not found';
      });
      t.send({ t: 'command', cmd: { type: 'play' } });
      await new Promise((r) => setTimeout(r, 0));
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    test('a command for a vanished session goes nowhere', async () => {
      const t = setup();
      await t.handle.ready;
      t.emit({ sessions: [session('A')], currentId: null });
      const key = entryKey(stableHash('A'), 0);
      t.emit({ sessions: [], currentId: null });
      t.send({ t: 'command', key, cmd: { type: 'play' } });
      expect(t.invoke.mock.calls.filter(([c]) => c === COMMAND_CMD)).toEqual([]);
    });
  });

  test('stop() unsubscribes and disconnects every session', async () => {
    const t = setup();
    await t.handle.ready;
    t.emit({ sessions: [session('A'), session('B')], currentId: null });
    t.handle.stop();
    expect(t.unlisten).toHaveBeenCalledOnce();
    expect(t.hub.registry.state().entries).toEqual([]);
    // Late events are ignored.
    t.emit({ sessions: [session('A')], currentId: null });
    expect(t.hub.registry.state().entries).toEqual([]);
  });

  test('stop() before the subscription is ready still unsubscribes', async () => {
    const t = setup();
    t.handle.stop();
    await t.handle.ready;
    expect(t.unlisten).toHaveBeenCalledOnce();
  });

  test('a listen failure is logged, not thrown', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hub = new Hub();
    const h = connectSessions(hub, {
      listen: async () => {
        throw new Error('no tauri');
      },
      invoke: async () => ({ sessions: [], currentId: null }),
    });
    await expect(h.ready).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
