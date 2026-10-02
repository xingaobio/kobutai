import { mount, unmount } from 'svelte';
import Overlay from '@/components/Overlay.svelte';
import { adapterFor } from '@/lib/media/adapters';
import { PageMediaController } from '@/lib/media/controller';
import { MediaReporter, type ClientPort } from '@/lib/media/reporter';
import { PORT_NAME, type RuntimeRequest, type SiteInfo } from '@/lib/messages';
import { loadPackIndex } from '@/lib/pack/loader';
import { defaultLayout, getLayout, hiddenSites, setLayout, setSiteHidden } from '@/lib/settings';
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
        if (msg.t === 'state' && isTop) live.registry = msg.state;
      },
    );
    reporter.start();
    ctx.onInvalidated(() => {
      reporter.dispose();
      controller.dispose();
    });

    if (!isTop) return;

    // --- Overlay (top frame only) ---
    const packs = await loadPackIndex(browser.runtime.getURL('/packs/index.json').replace(/index\.json$/, ''), 'builtin');
    const pack = packs[0];
    if (!pack) return;

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
      onMount(container, _shadow, shadowHost) {
        shadowHost.dataset.happydesk = 'true';
        return mount(Overlay, {
          target: container,
          props: {
            pack,
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
