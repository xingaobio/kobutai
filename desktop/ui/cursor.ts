/**
 * "overlay://cursor" (DESKTOP.md §4.4): the Rust side tells us when the cursor leaves every
 * interactive rectangle and the window turns click-through. In that state WebView2 may never
 * deliver `pointerleave`, so the overlay would keep showing its control bar. We end the hover
 * ourselves by dispatching the `pointerleave` Overlay.svelte listens for (on the character and
 * on the bar wrapper), so Overlay behaves exactly as after a real pointer leave: the bar hides
 * after its usual delay. Nothing in src/ is involved.
 */

export const CURSOR_EVENT = 'overlay://cursor';

export interface CursorPayload {
  inside: boolean;
}

export interface CursorIo {
  /** Subscribe to an event; resolves to the unsubscribe function. */
  listen(event: string, cb: (payload: CursorPayload) => void): Promise<() => void>;
}

/** The elements Overlay.svelte attaches onpointerenter/onpointerleave to. */
function hoverTargets(doc: Document): Element[] {
  const root = doc.querySelector('[data-testid="happydesk-overlay"]');
  // The wrapper of the control bar (it is not the element carrying the test id).
  const bar = doc.querySelector('[data-testid="happydesk-controls"]')?.parentElement;
  return [root, bar].filter((e): e is Element => !!e);
}

/** Make the overlay behave as if the pointer just left it. */
export function endHover(doc: Document = document): void {
  for (const el of hoverTargets(doc)) {
    // pointerleave does not bubble.
    el.dispatchEvent(typeof PointerEvent === 'function' ? new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }) : new Event('pointerleave'));
  }
}

export interface CursorHandle {
  stop(): void;
  ready: Promise<void>;
}

/**
 * While the user drags (button down on the page) a leave is held back and applied when the
 * button comes up: a drag moves the character out from under the cursor, and ending hover then
 * would pull the bar away mid-gesture. (Rust also keeps click-through off during a press.)
 */
export function connectCursor(io: CursorIo, doc: Document = document, end: () => void = () => endHover(doc)): CursorHandle {
  const win = doc.defaultView ?? window;
  let down = false;
  let pendingLeave = false;
  let stopped = false;

  const release = () => {
    down = false;
    if (pendingLeave) {
      pendingLeave = false;
      end();
    }
  };
  const onDown = (e: Event) => {
    if ((e as PointerEvent).button === 0) down = true;
  };
  // A move without a pressed button means we missed the release (it happened over another window).
  const onMove = (e: Event) => {
    if (down && (e as PointerEvent).buttons === 0) release();
  };
  win.addEventListener('pointerdown', onDown, true);
  win.addEventListener('pointerup', release, true);
  win.addEventListener('pointercancel', release, true);
  win.addEventListener('pointermove', onMove, true);

  let unlisten: (() => void) | undefined;
  const ready = io
    .listen(CURSOR_EVENT, (p) => {
      if (stopped || p?.inside !== false) return;
      if (down) pendingLeave = true;
      else end();
    })
    .then(
      (un) => {
        if (stopped) un();
        else unlisten = un;
      },
      (e: unknown) => console.warn(`[kobutai] cannot listen to ${CURSOR_EVENT}:`, e),
    );

  return {
    ready,
    stop() {
      stopped = true;
      unlisten?.();
      win.removeEventListener('pointerdown', onDown, true);
      win.removeEventListener('pointerup', release, true);
      win.removeEventListener('pointercancel', release, true);
      win.removeEventListener('pointermove', onMove, true);
    },
  };
}
