import { initLang } from '@/lib/i18n/core';
import { DataUrlCache, getBlob } from '@/lib/blobstore';
import { GachaEngine } from '@/lib/gacha/engine';
import { cryptoRandom } from '@/lib/gacha/pool';
import { Hub } from '@/lib/hub';
import { fetchPetdexManifest, importFromPetdex, removeUserPack } from '@/lib/importer';
import { syncIfStale } from '@/lib/librarySync';
import { AutoMatcher, within } from '@/lib/match/auto';
import { MATCH_RULES } from '@/lib/match/table';
import { PORT_NAME, VIEW_PORT_NAME, type BlobRequest } from '@/lib/messages';
import { PackCatalog } from '@/lib/pack/catalog';
import { createHdModels } from '@/lib/llm/models';
import { storageCredentialStore } from '@/lib/llm/store';
import {
  autoMatch,
  autoMatched,
  gachaState,
  llmCredentials,
  llmSettings,
  lockedPack,
  matchIndex,
  migrateLegacyAi,
  recordDraw,
  registryMeta,
  tagCache,
  userPacks,
} from '@/lib/settings';
import { aiTags } from '@/lib/tagging/ai';
import { LocalModel, extensionFetcher } from '@/lib/tagging/model/local';
import { Tagger } from '@/lib/tagging/tagger';
import type { MutableModels } from '@earendil-works/pi-ai';

/** A draw waits this long for a matched character to download; a slower one replaces the pool draw when it arrives. */
const MATCH_WAIT_MS = 6000;
const SLOW = Symbol('slow');
const REMATCH_WAIT_MS = 15_000;
/** Same limit as remote-library assets. */
const MATCH_MAX_SHEET_BYTES = 8 * 1024 * 1024;

export default defineBackground(() => {
  // Error messages the background produces (AI tagging) follow the interface language.
  void initLang();
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
  const migrated = migrateLegacyAi().catch((e) => console.warn('[kobutai] AI settings migration failed', e));
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
  // Opt-in (settings → 自动匹配角色): titles that name a known character show that character.
  const matcher = new AutoMatcher({
    enabled: () => autoMatch.getValue(),
    rules: MATCH_RULES,
    index: { get: () => matchIndex.getValue(), set: (v) => matchIndex.setValue(v) },
    used: { get: () => autoMatched.getValue(), set: (v) => autoMatched.setValue(v) },
    fetchManifest: fetchPetdexManifest,
    installed: async () => (await userPacks.getValue()).map((p) => p.id),
    importPet: async (pet) => (await importFromPetdex(pet, { maxBytes: MATCH_MAX_SHEET_BYTES })).id,
    removePack: removeUserPack,
    pinned: async () => {
      const ids = [await lockedPack.getValue(), (await gachaState.getValue())?.current?.packId];
      return ids.filter((id): id is string => !!id);
    },
    now: Date.now,
  });
  const engine = new GachaEngine({
    packs: () => catalog.all(),
    tag: (info) => tagger.tag(info),
    match: async (info) => {
      const pending = matcher.match(info);
      const id = await within<string | null | typeof SLOW>(pending, MATCH_WAIT_MS, SLOW);
      if (id === SLOW) {
        // Still downloading: draw from the pool now and switch to the character when it arrives.
        void pending.then((late) => {
          if (!late) return;
          catalog.invalidate();
          run(() => engine.adopt(info, late));
        });
        return null;
      }
      // The pack list was just written; don't draw from the copy cached before that.
      if (id) catalog.invalidate();
      return id;
    },
    // "换一次" on a matched character waits for the next one to download (the user asked for it).
    rematch: async (info, current) => {
      const id = await within(matcher.alternative(info, current), REMATCH_WAIT_MS, null);
      if (id) catalog.invalidate();
      return id;
    },
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
  catalog.onChange(() => {
    // Re-imported packs reuse their key with new bytes.
    blobs.invalidate();
    // A character deleted from the 图鉴 (or dropped with its library) leaves the screen at once.
    run(() => engine.prune());
  });
  run(async () => {});

  browser.runtime.onMessage.addListener((msg: BlobRequest, sender, respond) => {
    if (sender.id !== browser.runtime.id || msg?.t !== 'get-blob') return;
    blobs.get(msg.key).then(respond, () => respond(null));
    return true;
  });

  // Refresh remote libraries every 12 h (30 min after a failure). The alarm wakes the worker hourly to check.
  const checkLibraries = () => void syncIfStale().catch((e) => console.warn('[kobutai] library sync failed', e));
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === 'library-sync') checkLibraries();
  });
  void browser.alarms.create('library-sync', { periodInMinutes: 60 });
  checkLibraries();

  browser.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_NAME) hub.connect(port);
    // Only our own pages (the popup) may watch; content scripts run on web pages, not extension URLs.
    else if (port.name === VIEW_PORT_NAME && port.sender?.url?.startsWith(browser.runtime.getURL('/'))) hub.connectViewer(port);
  });
});
