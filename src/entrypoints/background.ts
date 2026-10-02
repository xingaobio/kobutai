import { DataUrlCache, getBlob } from '@/lib/blobstore';
import { GachaEngine } from '@/lib/gacha/engine';
import { cryptoRandom } from '@/lib/gacha/pool';
import { Hub } from '@/lib/hub';
import { PORT_NAME, type BlobRequest } from '@/lib/messages';
import { PackCatalog } from '@/lib/pack/catalog';
import { aiSettings, gachaState, lockedPack, recordDraw, registryMeta, tagCache } from '@/lib/settings';
import { aiTags } from '@/lib/tagging/ai';
import { Tagger } from '@/lib/tagging/tagger';

export default defineBackground(() => {
  const hub = new Hub();
  void registryMeta.getValue().then((m) => {
    if (m) hub.registry.importMeta(m);
    hub.onUpdate();
  });
  let metaSig = '';
  hub.onMeta = () => {
    const meta = hub.registry.exportMeta();
    const sig = JSON.stringify(meta);
    if (sig === metaSig) return;
    metaSig = sig;
    void registryMeta.setValue(meta);
  };
  const catalog = new PackCatalog();
  const blobs = new DataUrlCache(getBlob);
  const tagger = new Tagger(() => aiSettings.getValue(), { get: () => tagCache.getValue(), set: (v) => tagCache.setValue(v) }, aiTags);
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
      (e) => console.warn('[happydesk] gacha error', e),
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
  catalog.onChange(() => {
    // Re-imported packs reuse their key with new bytes.
    blobs.invalidate();
    run(async () => {});
  });
  run(async () => {});

  browser.runtime.onMessage.addListener((msg: BlobRequest, sender, respond) => {
    if (msg?.t !== 'get-blob' || sender.id !== browser.runtime.id) return;
    blobs.get(msg.key).then(respond, () => respond(null));
    return true;
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_NAME) hub.connect(port);
  });
});
