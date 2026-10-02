import { expect, test } from 'vitest';
import { Hub, type PortLike } from './hub';
import type { ToBackground, ToContent } from './messages';
import type { MediaSnapshot } from './media/types';

class FakePort implements PortLike {
  received: ToContent[] = [];
  private msgFns: ((m: ToBackground) => void)[] = [];
  private discFns: (() => void)[] = [];
  constructor(public sender: { tab?: { id?: number }; frameId?: number }) {}
  postMessage(m: ToContent) {
    this.received.push(structuredClone(m));
  }
  onMessage = { addListener: (fn: (m: ToBackground) => void) => void this.msgFns.push(fn) };
  onDisconnect = { addListener: (fn: () => void) => void this.discFns.push(fn) };
  send(m: ToBackground) {
    for (const f of this.msgFns) f(m);
  }
  disconnect() {
    for (const f of this.discFns) f();
  }
  last<T extends ToContent['t']>(t: T) {
    return this.received.filter((m) => m.t === t).at(-1) as Extract<ToContent, { t: T }> | undefined;
  }
}

const snap = (playing: boolean, title: string): MediaSnapshot => ({
  playing, currentTime: 0, duration: 10, volume: 1, muted: false, title, artist: '',
  canNext: false, canPrev: false, canSeek: true, adapter: 'generic', site: 'e.com',
});

function setup() {
  let t = 0;
  const hub = new Hub(() => (t += 100));
  const a = new FakePort({ tab: { id: 1 }, frameId: 0 });
  const aFrame = new FakePort({ tab: { id: 1 }, frameId: 7 });
  const b = new FakePort({ tab: { id: 2 }, frameId: 0 });
  for (const p of [a, aFrame, b]) hub.connect(p);
  return { hub, a, aFrame, b };
}

test('B controls media playing in A', () => {
  const { a, b } = setup();
  a.send({ t: 'snapshot', snap: snap(true, 'song') });
  expect(b.last('state')?.state.primary?.snapshot.title).toBe('song');
  b.send({ t: 'command', cmd: { type: 'pause' } });
  expect(a.last('command')?.cmd).toEqual({ type: 'pause' });
  expect(b.last('command')).toBeUndefined();
});

test('state goes only to top frames; commands reach iframes', () => {
  const { aFrame, b } = setup();
  aFrame.send({ t: 'snapshot', snap: snap(true, 'embedded') });
  expect(aFrame.last('state')).toBeUndefined();
  expect(b.last('state')?.state.primary?.key).toBe('1:7');
  b.send({ t: 'command', cmd: { type: 'next' } });
  expect(aFrame.last('command')?.cmd).toEqual({ type: 'next' });
});

test('explicit key and manual selection', () => {
  const { a, b } = setup();
  a.send({ t: 'snapshot', snap: snap(true, 'A') });
  b.send({ t: 'snapshot', snap: snap(true, 'B') });
  expect(a.last('state')?.state.primary?.key).toBe('2:0');
  a.send({ t: 'select', key: '1:0' });
  expect(a.last('state')?.state.primary?.key).toBe('1:0');
  a.send({ t: 'command', key: '2:0', cmd: { type: 'pause' } });
  expect(b.last('command')?.cmd).toEqual({ type: 'pause' });
});

test('disconnect removes entries; stale port disconnect is ignored after reconnect', () => {
  const { hub, a, b } = setup();
  a.send({ t: 'snapshot', snap: snap(true, 'A') });
  const a2 = new FakePort({ tab: { id: 1 }, frameId: 0 });
  hub.connect(a2);
  a.disconnect(); // old port; must not drop the entry owned by a2's key
  expect(hub.registry.primary()?.key).toBe('1:0');
  a2.disconnect();
  expect(b.last('state')?.state.primary).toBeNull();
});

test('new top frame gets state on connect; ports without tab are ignored', () => {
  const { hub, a } = setup();
  a.send({ t: 'snapshot', snap: snap(true, 'A') });
  const c = new FakePort({ tab: { id: 3 }, frameId: 0 });
  hub.connect(c);
  expect(c.received[0]).toMatchObject({ t: 'state' });
  const noTab = new FakePort({});
  hub.connect(noTab);
  expect(noTab.received).toEqual([]);
});

test('draw is broadcast to top frames and gacha requests are forwarded', () => {
  const { hub, a, aFrame, b } = setup();
  const gacha: unknown[] = [];
  hub.onGacha = (m) => gacha.push(m);
  const draw = { packId: 'momo', tags: { type: 'music' as const, genre: 'jpop' as const, source: 'rules' as const }, locked: false, canReroll: true };
  hub.setDraw(draw);
  expect(a.last('state')?.draw).toEqual(draw);
  expect(b.last('state')?.draw).toEqual(draw);
  expect(aFrame.last('state')).toBeUndefined();
  const before = a.received.length;
  hub.setDraw({ ...draw }); // unchanged → no broadcast
  expect(a.received.length).toBe(before);
  b.send({ t: 'reroll' });
  b.send({ t: 'lock', locked: true });
  expect(gacha).toEqual([{ t: 'reroll' }, { t: 'lock', locked: true }]);
});

test('onUpdate fires on snapshot, select and disconnect', () => {
  const { hub, a } = setup();
  let n = 0;
  hub.onUpdate = () => n++;
  a.send({ t: 'snapshot', snap: snap(true, 'A') });
  a.send({ t: 'select', key: '1:0' });
  a.disconnect();
  expect(n).toBe(3);
});
