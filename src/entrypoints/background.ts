import { DataUrlCache, getBlob } from '@/lib/blobstore';
import { GachaEngine } from '@/lib/gacha/engine';
import { cryptoRandom } from '@/lib/gacha/pool';
import { Hub } from '@/lib/hub';
import { syncIfStale } from '@/lib/librarySync';
import { PORT_NAME, type BlobRequest } from '@/lib/messages';
import { PackCatalog } from '@/lib/pack/catalog';
import { createHdModels } from '@/lib/llm/models';
import { storageCredentialStore } from '@/lib/llm/store';
import {
  gachaState,
  llmCredentials,
  llmSettings,
  lockedPack,
  migrateLegacyAi,
  recordDraw,
  registryMeta,
  tagCache,
} from '@/lib/settings';
import { aiTags } from '@/lib/tagging/ai';
import { LocalModel, extensionFetcher } from '@/lib/tagging/model/local';
import { Tagger } from '@/lib/tagging/tagger';
import type { MutableModels } from '@earendil-works/pi-ai';

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
  // Service workers can't import() at runtime, so pi-ai and its SDKs are bundled in; the
  // models are only built once AI tagging is used, and rebuilt after custom endpoints change.
  // Credentials are read per request.
  const credentials = storageCredentialStore(llmCredentials);
  let models: MutableModels | null = null;
  llmSettings.watch(() => (models = null));
  const migrated = migrateLegacyAi().catch((e) => console.warn('[happydesk] AI settings migration failed', e));
  const settings = async () => (await migrated, llmSettings.getValue());
  // The on-device classifier ships in public/model/ and loads on the first draw.
  const localModel = new LocalModel(extensionFetcher((p) => browser.runtime.getURL(p)));
  const tagger = new Tagger(
    settings,
    { get: () => tagCache.getValue(), set: (v) => tagCache.setValue(v) },
    (info, s) => aiTags(info, s, (models ??= createHdModels(credentials, s.custom))),
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
    if (sender.id !== browser.runtime.id || msg?.t !== 'get-blob') return;
    blobs.get(msg.key).then(respond, () => respond(null));
    return true;
  });

  // Refresh remote libraries every 12 h (30 min after a failure). The alarm wakes the worker hourly to check.
  const checkLibraries = () => void syncIfStale().catch((e) => console.warn('[happydesk] library sync failed', e));
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === 'library-sync') checkLibraries();
  });
  void browser.alarms.create('library-sync', { periodInMinutes: 60 });
  checkLibraries();

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_NAME) hub.connect(port);
  });
});
