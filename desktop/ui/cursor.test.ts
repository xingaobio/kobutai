import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { CURSOR_EVENT, connectCursor, endHover, type CursorIo, type CursorPayload } from './cursor';

function fakeIo() {
  let emit: (p: CursorPayload) => void = () => {};
  const unlisten = vi.fn();
  const io: CursorIo = {
    listen: async (event, cb) => {
      expect(event).toBe(CURSOR_EVENT);
      emit = cb;
      return unlisten;
    },
  };
  return { io, emit: (p: CursorPayload) => emit(p), unlisten };
}

function ptr(type: string, init: Record<string, unknown> = {}) {
  return Object.assign(new Event(type, { bubbles: true }), { button: 0, buttons: 1, ...init });
}

describe('endHover', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div data-testid="happydesk-overlay"></div>
      <div class="bar-wrap"><div data-testid="happydesk-controls"></div></div>`;
  });

  test('dispatches pointerleave on the character and on the bar wrapper, not bubbling', () => {
    const root = document.querySelector('[data-testid="happydesk-overlay"]')!;
    const wrap = document.querySelector('.bar-wrap')!;
    const onRoot = vi.fn();
    const onWrap = vi.fn();
    const onBody = vi.fn();
    root.addEventListener('pointerleave', onRoot);
    wrap.addEventListener('pointerleave', onWrap);
    document.body.addEventListener('pointerleave', onBody);
    endHover();
    expect(onRoot).toHaveBeenCalledOnce();
    expect(onWrap).toHaveBeenCalledOnce();
    expect(onBody).not.toHaveBeenCalled();
  });

  test('does nothing when nothing is shown', () => {
    document.body.innerHTML = '';
    expect(() => endHover()).not.toThrow();
  });
});

describe('connectCursor', () => {
  let end: Mock<() => void>;
  beforeEach(() => {
    end = vi.fn<() => void>();
  });
  afterEach(() => vi.restoreAllMocks());

  test('inside:false ends the hover, inside:true does not', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    await h.ready;
    t.emit({ inside: true });
    expect(end).not.toHaveBeenCalled();
    t.emit({ inside: false });
    expect(end).toHaveBeenCalledOnce();
    h.stop();
  });

  test('a leave during a drag waits for the button to come up', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    await h.ready;
    window.dispatchEvent(ptr('pointerdown'));
    t.emit({ inside: false });
    expect(end).not.toHaveBeenCalled();
    window.dispatchEvent(ptr('pointerup'));
    expect(end).toHaveBeenCalledOnce();
    // The drag is over: the next leave is immediate and the earlier one is not repeated.
    window.dispatchEvent(ptr('pointerup'));
    expect(end).toHaveBeenCalledOnce();
    t.emit({ inside: false });
    expect(end).toHaveBeenCalledTimes(2);
    h.stop();
  });

  test('a drag with no leave during it ends nothing', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    await h.ready;
    window.dispatchEvent(ptr('pointerdown'));
    window.dispatchEvent(ptr('pointerup'));
    expect(end).not.toHaveBeenCalled();
    h.stop();
  });

  test('a missed release (move with no button) is recovered', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    await h.ready;
    window.dispatchEvent(ptr('pointerdown'));
    t.emit({ inside: false });
    window.dispatchEvent(ptr('pointermove', { buttons: 1 }));
    expect(end).not.toHaveBeenCalled();
    window.dispatchEvent(ptr('pointermove', { buttons: 0 }));
    expect(end).toHaveBeenCalledOnce();
    h.stop();
  });

  test('only the primary button counts as a drag', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    await h.ready;
    window.dispatchEvent(ptr('pointerdown', { button: 2 }));
    t.emit({ inside: false });
    expect(end).toHaveBeenCalledOnce();
    h.stop();
  });

  test('stop unsubscribes, ignores later events and removes the listeners', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    await h.ready;
    h.stop();
    expect(t.unlisten).toHaveBeenCalledOnce();
    t.emit({ inside: false });
    expect(end).not.toHaveBeenCalled();
  });

  test('stop before subscribing finishes still unsubscribes', async () => {
    const t = fakeIo();
    const h = connectCursor(t.io, document, end);
    h.stop();
    await h.ready;
    expect(t.unlisten).toHaveBeenCalledOnce();
  });

  test('a listen failure is only logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = connectCursor({ listen: async () => Promise.reject(new Error('no tauri')) }, document, end);
    await expect(h.ready).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    h.stop();
  });
});
