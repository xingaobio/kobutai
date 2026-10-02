import { mount, unmount } from 'svelte';
import Overlay from '@/components/Overlay.svelte';
import { startFrameReporter } from '@/lib/media/frame';
import type { BlobRequest, RuntimeRequest, SiteInfo } from '@/lib/messages';
import { PackCatalog } from '@/lib/pack/catalog';
import { defaultLayout, getLayout, hiddenSites, setLayout, setSiteHidden } from '@/lib/settings';
import { blobKey, isBlobRef } from '@/lib/blobstore';
import { setSrcResolver } from '@/lib/render/renderer';
import { live } from '@/lib/ui/live.svelte';
import { openPip, pipApi } from '@/lib/ui/pip';

/** Top frame: reports media and hosts the overlay. Subframes use frame.content.ts. */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const host = location.hostname;
    const reporter = startFrameReporter(ctx, (msg) => {
      if (msg.t === 'state') {
        live.registry = msg.state;
        live.draw = msg.draw;
      }
    });

    // --- Overlay ---
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
      onMount(container, shadow, shadowHost) {
        shadowHost.dataset.happydesk = 'true';
        const send = (msg: Parameters<typeof reporter.send>[0]) => reporter.send(msg);
        return mount(Overlay, {
          target: container,
          props: {
            layout,
            send,
            saveLayout: (l) => void setLayout(host, l),
            hideSite: () => void setSiteHidden(host, true),
            openPip: pipApi() ? () => void openPip(shadow, send) : undefined,
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
