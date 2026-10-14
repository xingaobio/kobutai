import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createStorage, jsonEqual, type WebStorageLike } from './storage';

/** Just enough Storage for the shim, with a handle to fake another window's writes. */
function fakeWebStorage() {
  const m = new Map<string, string>();
  const ls: WebStorageLike & { m: Map<string, string> } = {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
  return ls;
}

function setup() {
  const ls = fakeWebStorage();
  const events = new EventTarget();
  const storage = createStorage({ persistent: ls, events: events as unknown as Pick<Window, 'addEventListener'> });
  /** A write by another window: localStorage changes and a `storage` event arrives. */
  const foreignWrite = (key: string, value: unknown | null) => {
    const oldValue = ls.m.get(key) ?? null;
    const newValue = value === null ? null : JSON.stringify(value);
    if (newValue === null) ls.m.delete(key);
    else ls.m.set(key, newValue);
    events.dispatchEvent(Object.assign(new Event('storage'), { key, oldValue, newValue, storageArea: null }));
  };
  return { ls, storage, foreignWrite };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => (ctx = setup()));

describe('items', () => {
  test('fallback when nothing is stored, and null without one', async () => {
    const withFallback = ctx.storage.defineItem<string[]>('local:list', { fallback: ['a'] });
    const without = ctx.storage.defineItem<number>('local:n');
    expect(await withFallback.getValue()).toEqual(['a']);
    expect(await without.getValue()).toBeNull();
    expect(withFallback.fallback).toEqual(['a']);
  });

  test('a stored falsy value is not replaced by the fallback', async () => {
    const flag = ctx.storage.defineItem<boolean>('local:flag', { fallback: true });
    await flag.setValue(false);
    expect(await flag.getValue()).toBe(false);
    const empty = ctx.storage.defineItem<string>('local:s', { fallback: 'x' });
    await empty.setValue('');
    expect(await empty.getValue()).toBe('');
  });

  test('set / get / remove round-trip through JSON in localStorage', async () => {
    const item = ctx.storage.defineItem<{ a: number[] }>('local:obj', { fallback: { a: [] } });
    await item.setValue({ a: [1, 2] });
    expect(JSON.parse(ctx.ls.m.get('local:obj')!)).toEqual({ a: [1, 2] });
    expect(await item.getValue()).toEqual({ a: [1, 2] });
    await item.removeValue();
    expect(ctx.ls.m.has('local:obj')).toBe(false);
    expect(await item.getValue()).toEqual({ a: [] });
  });

  test('setting null or undefined removes the value, like chrome.storage', async () => {
    const item = ctx.storage.defineItem<string | null>('sync:locked', { fallback: null });
    await item.setValue('x');
    await item.setValue(null);
    expect(ctx.ls.m.has('sync:locked')).toBe(false);
    await ctx.storage.setItem('local:k', 1);
    await ctx.storage.setItem('local:k', undefined as unknown as null);
    expect(await ctx.storage.getItem('local:k')).toBeNull();
  });

  test('values are copies: mutating what was read does not change storage', async () => {
    const item = ctx.storage.defineItem<{ n: number }>('session:copy', { fallback: { n: 0 } });
    await item.setValue({ n: 1 });
    const got = (await item.getValue())!;
    got.n = 99;
    expect(await item.getValue()).toEqual({ n: 1 });
    const fb = item.fallback;
    fb.n = 5;
    expect(item.fallback).toEqual({ n: 0 });
  });

  test('keys need a known area', () => {
    expect(() => ctx.storage.defineItem('managed:x' as 'local:x')).toThrow(/Invalid storage key/);
    expect(() => ctx.storage.defineItem('nope' as 'local:x')).toThrow(/Invalid storage key/);
  });

  test('unreadable stored JSON counts as missing', async () => {
    ctx.ls.m.set('local:bad', '{oops');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const item = ctx.storage.defineItem<string>('local:bad', { fallback: 'ok' });
    expect(await item.getValue()).toBe('ok');
  });
});

describe('areas', () => {
  test('local and sync persist; session stays in memory', async () => {
    await ctx.storage.setItem('local:a', 1);
    await ctx.storage.setItem('sync:b', 2);
    await ctx.storage.setItem('session:c', 3);
    expect([...ctx.ls.m.keys()].sort()).toEqual(['local:a', 'sync:b']);
    expect(await ctx.storage.getItem('session:c')).toBe(3);
  });

  test('the same name in different areas is a different item', async () => {
    await ctx.storage.setItem('local:x', 'L');
    await ctx.storage.setItem('sync:x', 'S');
    expect(await ctx.storage.getItem('local:x')).toBe('L');
    expect(await ctx.storage.getItem('sync:x')).toBe('S');
  });

  test('a new instance sees persisted values but not session ones', async () => {
    await ctx.storage.setItem('local:keep', 'yes');
    await ctx.storage.setItem('session:gone', 'no');
    const again = createStorage({ persistent: ctx.ls });
    expect(await again.getItem('local:keep')).toBe('yes');
    expect(await again.getItem('session:gone')).toBeNull();
  });

  test('without persistent storage everything lives in memory', async () => {
    const mem = createStorage({ persistent: null });
    await mem.setItem('local:a', 1);
    expect(await mem.getItem('local:a')).toBe(1);
  });

  test('getItem: stored value, else the option fallback, else null', async () => {
    expect(await ctx.storage.getItem('local:none')).toBeNull();
    expect(await ctx.storage.getItem('local:none', { fallback: 7 })).toBe(7);
    await ctx.storage.setItem('local:none', 0);
    expect(await ctx.storage.getItem('local:none', { fallback: 7 })).toBe(0);
  });

  test('removeItem', async () => {
    await ctx.storage.setItem('local:r', 'x');
    await ctx.storage.removeItem('local:r');
    expect(await ctx.storage.getItem('local:r')).toBeNull();
  });
});

describe('init', () => {
  test('runs once when nothing is stored, and the result persists', async () => {
    const init = vi.fn(() => 'id-1');
    const item = ctx.storage.defineItem<string>('local:installId', { init });
    expect(await item.getValue()).toBe('id-1');
    expect(await item.getValue()).toBe('id-1');
    expect(init).toHaveBeenCalledTimes(1);
    expect(ctx.ls.m.get('local:installId')).toBe('"id-1"');
    // A later session (new item over the same store) reads it instead of initialising again.
    const again = ctx.storage.defineItem<string>('local:installId', { init: () => 'id-2' });
    expect(await again.getValue()).toBe('id-1');
  });

  test('concurrent first reads share one init', async () => {
    const init = vi.fn(async () => {
      await Promise.resolve();
      return Math.random();
    });
    const item = ctx.storage.defineItem<number>('local:rnd', { init });
    const [a, b, c] = await Promise.all([item.getValue(), item.getValue(), item.getValue()]);
    expect(init).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('does not run when a value is already stored', async () => {
    await ctx.storage.setItem('local:have', 'mine');
    const init = vi.fn(() => 'new');
    expect(await ctx.storage.defineItem<string>('local:have', { init }).getValue()).toBe('mine');
    expect(init).not.toHaveBeenCalled();
  });

  test('init runs again after the value is removed', async () => {
    let n = 0;
    const item = ctx.storage.defineItem<number>('local:cnt', { init: () => ++n });
    expect(await item.getValue()).toBe(1);
    await item.removeValue();
    expect(await item.getValue()).toBe(2);
  });

  test('a failing init rejects that read and lets the next one try again', async () => {
    let n = 0;
    const item = ctx.storage.defineItem<number>('local:flaky', {
      init: () => {
        if (++n === 1) throw new Error('boom');
        return n;
      },
    });
    await expect(item.getValue()).rejects.toThrow('boom');
    expect(await item.getValue()).toBe(2);
  });
});

describe('watch', () => {
  test('fires right after a write in this window, with new and old values', async () => {
    const item = ctx.storage.defineItem<number>('local:w', { fallback: 0 });
    const seen: [number, number][] = [];
    item.watch((n, o) => seen.push([n, o]));
    const p = item.setValue(5);
    // setValue's body runs synchronously up to the first await; the watcher must not wait for a macrotask.
    expect(seen).toEqual([[5, 0]]);
    await p;
    await item.setValue(6);
    expect(seen).toEqual([[5, 0], [6, 5]]);
  });

  test('reports the fallback after removal', async () => {
    const item = ctx.storage.defineItem<string>('local:wr', { fallback: 'dflt' });
    await item.setValue('x');
    const seen: [string, string][] = [];
    item.watch((n, o) => seen.push([n, o]));
    await item.removeValue();
    expect(seen).toEqual([['dflt', 'x']]);
  });

  test('does not fire when the value is unchanged (deep equality)', async () => {
    const item = ctx.storage.defineItem<{ a: number[] }>('local:same', { fallback: { a: [] } });
    await item.setValue({ a: [1] });
    const cb = vi.fn();
    item.watch(cb);
    await item.setValue({ a: [1] });
    expect(cb).not.toHaveBeenCalled();
    await item.setValue({ a: [2] });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('the returned function stops it', async () => {
    const item = ctx.storage.defineItem<number>('local:un', { fallback: 0 });
    const cb = vi.fn();
    const unwatch = item.watch(cb);
    await item.setValue(1);
    unwatch();
    await item.setValue(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('all watchers of a key are told, also those of other items on that key', async () => {
    const a = ctx.storage.defineItem<number>('local:two', { fallback: 0 });
    const b = ctx.storage.defineItem<number>('local:two', { fallback: 0 });
    const cb = vi.fn();
    b.watch(cb);
    await a.setValue(3);
    expect(cb).toHaveBeenCalledWith(3, 0);
  });

  test('session keys notify too', async () => {
    const item = ctx.storage.defineItem<string | null>('session:s', { fallback: null });
    const cb = vi.fn();
    item.watch(cb);
    await item.setValue('x');
    expect(cb).toHaveBeenCalledWith('x', null);
  });

  test('one failing watcher does not stop the others or the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const item = ctx.storage.defineItem<number>('local:err', { fallback: 0 });
    const ok = vi.fn();
    item.watch(() => {
      throw new Error('bad watcher');
    });
    item.watch(ok);
    await item.setValue(1);
    expect(ok).toHaveBeenCalledWith(1, 0);
    expect(await item.getValue()).toBe(1);
  });

  test('another window\'s write arrives through the storage event', async () => {
    const item = ctx.storage.defineItem<{ n: number }>('local:x', { fallback: { n: 0 } });
    await item.setValue({ n: 1 });
    const cb = vi.fn();
    item.watch(cb);
    ctx.foreignWrite('local:x', { n: 2 });
    expect(cb).toHaveBeenCalledWith({ n: 2 }, { n: 1 });
    expect(await item.getValue()).toEqual({ n: 2 });
    ctx.foreignWrite('local:x', null);
    expect(cb).toHaveBeenLastCalledWith({ n: 0 }, { n: 2 });
  });

  test('storage events for other keys, session keys and unwatched keys are ignored', async () => {
    const item = ctx.storage.defineItem<number>('local:mine', { fallback: 0 });
    const sess = ctx.storage.defineItem<number>('session:mine', { fallback: 0 });
    const cb = vi.fn();
    item.watch(cb);
    sess.watch(cb);
    ctx.foreignWrite('local:other', 1);
    ctx.foreignWrite('session:mine', 1);
    ctx.foreignWrite('local:unwatched', 1);
    expect(cb).not.toHaveBeenCalled();
  });

  test('the raw watch (storage.watch) reports null for a missing value', async () => {
    const cb = vi.fn();
    ctx.storage.watch('local:raw', cb);
    await ctx.storage.setItem('local:raw', 'v');
    await ctx.storage.removeItem('local:raw');
    expect(cb.mock.calls).toEqual([['v', null], [null, 'v']]);
  });
});

describe('jsonEqual', () => {
  test('compares deeply and by type', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(jsonEqual([1], { 0: 1 })).toBe(false);
    expect(jsonEqual(null, undefined)).toBe(false);
    expect(jsonEqual(NaN, NaN)).toBe(true);
  });
});
