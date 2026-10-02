import { mount, unmount } from 'svelte';
import Overlay from '@/components/Overlay.svelte';
import { adapterFor } from '@/lib/media/adapters';
import { PageMediaController } from '@/lib/media/controller';
import { MediaReporter, type ClientPort } from '@/lib/media/reporter';
import { PORT_NAME, type BlobRequest, type RuntimeRequest, type SiteInfo } from '@/lib/messages';
import { PackCatalog } from '@/lib/pack/catalog';
import { defaultLayout, getLayout, hiddenSites, setLayout, setSiteHidden } from '@/lib/settings';
import { blobKey, isBlobRef } from '@/lib/blobstore';
import { setSrcResolver } from '@/lib/render/renderer';
import { live } from '@/lib/ui/live.svelte';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const host = location.hostname;
    const controller = new PageMediaController(document, location, adapterFor(host));
    const isTop = window.top === window;

    const reporter = new MediaReporter(
      controller,
      () => browser.runtime.connect({ name: PORT_NAME }) as unknown as ClientPort,
      document,
      (msg) => {
        if (msg.t === 'state' && isTop) {
          live.registry = msg.state;
          live.draw = msg.draw;
        }
      },
    );
    reporter.start();
    ctx.onInvalidated(() => {
      reporter.dispose();
      controller.dispose();
    });

    if (!isTop) return;

    // --- Overlay (top frame only) ---
    setSrcResolver(async (src) => {
      if (!isBlobRef(src)) return src;
      const url = (await browser.runtime.sendMessage({ t: 'get-blob', key: blobKey(src) } satisfies BlobRequest)) as string | null;
      if (!url) throw new Error(`missing asset ${src}`);
      return url;
    });
    const catalog = new PackCatalog();
    live.packs = await catalog.all();
    const pack = live.packs[0];
    if (!pack) return;
    ctx.onInvalidated(catalog.onChange((packs) => (live.packs = packs)));

    live.hidden = (await hiddenSites.getValue()).includes(host);
    const unwatch = hiddenSites.watch((list) => (live.hidden = list.includes(host)));
    const onFullscreen = () => (live.fullscreen = !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    ctx.onInvalidated(() => {
      unwatch();
      document.removeEventListener('fullscreenchange', onFullscreen);
    });

    browser.runtime.onMessage.addListener((req: RuntimeRequest, _sender, respond) => {
      if (req.t === 'site-info') {
        respond({ host, hidden: live.hidden } satisfies SiteInfo);
      } else if (req.t === 'set-site-hidden') {
        void setSiteHidden(host, req.hidden).then(() => respond({ host, hidden: req.hidden } satisfies SiteInfo));
        return true;
      }
    });

    const view = { w: innerWidth, h: innerHeight };
    const layout = (await getLayout(host)) ?? defaultLayout(pack.size, view);

    const ui = await createShadowRootUi(ctx, {
      name: 'happydesk-overlay',
      position: 'inline',
      anchor: 'html',
      append: 'last',
      // Keys typed into the control bar must not trigger the page's own hotkeys.
      isolateEvents: true,
      onMount(container, _shadow, shadowHost) {
        shadowHost.dataset.happydesk = 'true';
        return mount(Overlay, {
          target: container,
          props: {
            layout,
            send: (msg) => reporter.send(msg),
            saveLayout: (l) => void setLayout(host, l),
            hideSite: () => void setSiteHidden(host, true),
          },
        });
      },
      onRemove(app) {
        if (app) void unmount(app);
      },
    });
    ui.mount();
  },
});
