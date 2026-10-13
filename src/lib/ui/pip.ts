import { mount, unmount } from 'svelte';
import PipView from '../../components/PipView.svelte';
import type { ToBackground } from '../messages';
import { live } from './live.svelte';

interface DocumentPiP {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
  window: Window | null;
}

export function pipApi(win: Window = window): DocumentPiP | null {
  // Only top-level documents may open one.
  if (win.top !== win) return null;
  return (win as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture ?? null;
}

const BASE_CSS = `html,body{margin:0;background:#18181e;color-scheme:dark;overflow:hidden}`;

/**
 * Open the always-on-top window with the mascot and controls. Must run inside a
 * user gesture. The overlay's stylesheet (in its shadow root) is copied over.
 */
export async function openPip(styleRoot: ShadowRoot, send: (msg: ToBackground) => void): Promise<boolean> {
  const api = pipApi();
  if (!api || api.window) return false;
  let win: Window;
  try {
    win = await api.requestWindow({ width: 320, height: 420 });
  } catch (e) {
    console.warn('[happydesk] picture-in-picture unavailable', e);
    return false;
  }
  const doc = win.document;
  doc.title = 'Kobutai';
  const base = doc.createElement('style');
  base.textContent = BASE_CSS;
  doc.head.append(base);
  for (const node of styleRoot.querySelectorAll('style, link[rel="stylesheet"]')) doc.head.append(node.cloneNode(true));

  const app = mount(PipView, { target: doc.body, props: { send } });
  live.pip = true;
  win.addEventListener(
    'pagehide',
    () => {
      void unmount(app);
      live.pip = false;
    },
    { once: true },
  );
  return true;
}
