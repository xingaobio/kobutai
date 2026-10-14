import { DataUrlCache, blobKey, getBlob, isBlobRef } from '@/lib/blobstore';
import { GachaEngine } from '@/lib/gacha/engine';
import { cryptoRandom } from '@/lib/gacha/pool';
import { Hub, type PortLike } from '@/lib/hub';
import { DEFAULT_LLM_SETTINGS } from '@/lib/llm/config';
import type { ToBackground, ToContent } from '@/lib/messages';
import { PackCatalog } from '@/lib/pack/catalog';
import { setSrcResolver } from '@/lib/render/renderer';
import { gachaState, lockedPack, recordDraw } from '@/lib/settings';
import { LocalModel, extensionFetcher } from '@/lib/tagging/model/local';
import { Tagger } from '@/lib/tagging/tagger';
import { live } from '@/lib/ui/live.svelte';

/**
 * The extension's background script (src/entrypoints/background.ts), minus what D1 leaves out
 * (DESKTOP.md §1): no AI tagging, no remote library sync, no Petdex matching, no alarms, and no
 * runtime messaging. The overlay page is its own background: it hosts the hub, which feeds the
 * `live` store the overlay renders, and the overlay's `send` goes straight into the hub.
 */
export function createCore() {
  const hub = new Hub();
  const catalog = new PackCatalog();
  const blobs = new DataUrlCache(getBlob);

  // `hdblob:` references (imported characters) resolve here, with no content script in between.
  setSrcResolver(async (src) => {
    if (!isBlobRef(src)) return src;
    const url = await blobs.get(blobKey(src));
    if (!url) throw new Error(`missing asset ${src}`);
    return url;
  });

  // The on-device classifier ships in public/model/ and loads on the first draw. With no AI model
  // configured the tagger never asks one; keyword rules cover a failed model load.
  const localModel = new LocalModel(extensionFetcher((p) => browser.runtime.getURL(p)));
  const tagger = new Tagger(
    async () => DEFAULT_LLM_SETTINGS,
    { get: async () => ({}), set: async () => {} },
    async () => null,
    undefined,
    (info) => localModel.tag(info),
  );

  const engine = new GachaEngine({
    packs: () => catalog.all(),
    tag: (info) => tagger.tag(info),
    rng: cryptoRandom,
    locked: () => lockedPack.getValue(),
    record: (id) => recordDraw(id),
    load: () => gachaState.getValue(),
    save: (s) => gachaState.setValue(s),
  });

  // Serialize engine work so draws never interleave.
  let chain = Promise.resolve();
  const run = (fn: () => Promise<unknown>) => {
    chain = chain.then(fn).then(
      async () => hub.setDraw(await engine.view()),
      (e) => console.warn('[kobutai] gacha error', e),
    );
  };

  // Snapshots arrive about once a second; only content/playing changes matter to the engine.
  let lastSig = '';
  hub.onUpdate = () => {
    const snap = hub.registry.primary()?.snapshot ?? null;
    const sig = snap ? `${snap.site}|${snap.title}|${snap.artist}|${snap.playing}` : '';
    if (sig === lastSig) return;
    lastSig = sig;
    run(() => engine.onMedia(snap));
  };
  hub.onGacha = (msg) => {
    if (msg.t === 'reroll') run(() => engine.reroll());
    else
      run(async () => {
        const view = await engine.view();
        await lockedPack.setValue(msg.locked ? (view?.packId ?? null) : null);
      });
  };
  lockedPack.watch(() => run(async () => {}));
  const stopCatalog = catalog.onChange((packs) => {
    live.packs = packs;
    // Re-imported packs reuse their key with new bytes.
    blobs.invalidate();
    // A character deleted from the 图鉴 leaves the screen at once.
    run(() => engine.prune());
  });
  run(async () => {});

  // The overlay is a viewer of the hub: it receives the registry state and the current draw, and
  // may send anything but snapshots (those come from the sessions, see sessions.ts).
  const toHub: ((msg: ToBackground) => void)[] = [];
  const viewer: PortLike = {
    postMessage(msg: ToContent) {
      if (msg.t !== 'state') return;
      live.registry = msg.state;
      live.draw = msg.draw;
    },
    onMessage: { addListener: (fn) => void toHub.push(fn) },
    onDisconnect: { addListener: () => {} },
  };
  hub.connectViewer(viewer);

  return {
    hub,
    catalog,
    /** The overlay's `send`. */
    send: (msg: ToBackground) => toHub.forEach((fn) => fn(msg)),
    /** Resolves once the queued engine work (draws, pruning) is done. */
    settled: () => chain,
    dispose: stopCatalog,
  };
}

export type Core = ReturnType<typeof createCore>;
