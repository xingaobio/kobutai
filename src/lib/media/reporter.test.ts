import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MediaReporter, type ClientPort } from './reporter';
import type { MediaCommand, MediaController, MediaSnapshot } from './types';
import type { ToBackground, ToContent } from '../messages';

class Port implements ClientPort {
  sent: ToBackground[] = [];
  msg: ((m: ToContent) => void)[] = [];
  disc: (() => void)[] = [];
  postMessage(m: ToBackground) {
    this.sent.push(m);
  }
  onMessage = { addListener: (f: (m: ToContent) => void) => void this.msg.push(f) };
  onDisconnect = { addListener: (f: () => void) => void this.disc.push(f) };
}

const base: MediaSnapshot = {
  playing: false, currentTime: 0, duration: 100, volume: 1, muted: false, title: 'x', artist: '',
  canNext: false, canPrev: false, canSeek: true, adapter: 'generic', site: 'e.com',
};

class Ctl implements MediaController {
  id = 'generic';
  snap: MediaSnapshot | null = { ...base };
  cmds: MediaCommand[] = [];
  snapshot() {
    return this.snap && { ...this.snap };
  }
  run(c: MediaCommand) {
    this.cmds.push(c);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(snap: MediaSnapshot | null = { ...base }) {
  const ctl = new Ctl();
  ctl.snap = snap;
  const ports: Port[] = [];
  const r = new MediaReporter(ctl, () => {
    const p = new Port();
    ports.push(p);
    return p;
  });
  r.start();
  return { ctl, ports, r };
}

test('reports initial snapshot and only meaningful changes', async () => {
  const { ctl, ports, r } = setup();
  expect(ports[0]!.sent).toHaveLength(1);
  ctl.snap!.currentTime = 0.3;
  r.report();
  expect(ports[0]!.sent).toHaveLength(1); // small progress is not news
  ctl.snap!.currentTime = 2;
  r.report();
  ctl.snap!.playing = true;
  r.report();
  expect(ports[0]!.sent).toHaveLength(3);
  r.dispose();
});

test('silent frames do not report null', () => {
  const { ports, r } = setup(null);
  vi.advanceTimersByTime(5000);
  expect(ports[0]!.sent).toEqual([]);
  r.dispose();
});

test('media disappearing reports null once', () => {
  const { ctl, ports, r } = setup();
  ctl.snap = null;
  r.report();
  r.report();
  expect(ports[0]!.sent.map((m) => (m as { snap: unknown }).snap)).toEqual([expect.any(Object), null]);
  r.dispose();
});

test('runs routed commands', () => {
  const { ctl, ports, r } = setup();
  for (const f of ports[0]!.msg) f({ t: 'command', cmd: { type: 'pause' } });
  expect(ctl.cmds).toEqual([{ type: 'pause' }]);
  r.dispose();
});

test('reconnects after disconnect and resends state', () => {
  const { ports, r } = setup();
  for (const f of ports[0]!.disc) f();
  vi.advanceTimersByTime(300);
  expect(ports).toHaveLength(2);
  expect(ports[1]!.sent).toHaveLength(1);
  r.dispose();
});

test('stops when the extension context is gone', () => {
  const ctl = new Ctl();
  const r = new MediaReporter(ctl, () => {
    throw new Error('Extension context invalidated.');
  });
  expect(() => r.start()).not.toThrow();
});
