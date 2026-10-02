import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.output/chrome-mv3');

/** 5 s mono 8 kHz 16-bit sine tone. */
function wav(seconds = 5, rate = 8000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), 44 + i * 2);
  return buf;
}

// Inline so the media is fully buffered and seekable (routed responses lack Range support).
const TONE_URL = `data:audio/wav;base64,${wav().toString('base64')}`;

export { TONE_URL };

export function mediaPage(title: string) {
  return `<!doctype html><html><head><title>${title}</title></head><body style="height:2000px">
  <h1>${title}</h1>
  <audio id="media" src="${TONE_URL}" loop preload="auto"></audio>
  <button id="fs" onclick="document.documentElement.requestFullscreen()">fullscreen</button>
  </body></html>`;
}

export const test = base.extend<{ context: BrowserContext; open: (host: string, html?: string) => Promise<Page> }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1200, height: 800 },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--autoplay-policy=no-user-gesture-required'],
    });
    await context.route(/^http:\/\/[a-z]+\.test\//, async (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({ body: mediaPage(url.hostname), contentType: 'text/html' });
    });
    // Wait for the service worker so content scripts can connect.
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
    await use(context);
    await context.close();
  },
  open: async ({ context }, use) => {
    await use(async (host, html) => {
      const page = await context.newPage();
      if (html) await page.route(`http://${host}/`, (r) => r.fulfill({ body: html, contentType: 'text/html' }));
      await page.goto(`http://${host}/`);
      await page.getByTestId('happydesk-mascot').waitFor();
      return page;
    });
  },
});

export const expect = test.expect;

export const audio = (page: Page) => ({
  play: () => page.evaluate(() => (document.getElementById('media') as HTMLAudioElement).play()),
  pause: () => page.evaluate(() => (document.getElementById('media') as HTMLAudioElement).pause()),
  state: () =>
    page.evaluate(() => {
      const a = document.getElementById('media') as HTMLAudioElement;
      return { paused: a.paused, currentTime: a.currentTime, volume: a.volume, muted: a.muted };
    }),
});

/** Simulate a user dragging a range input: input events while moving, change on release. */
export async function setRange(locator: import('@playwright/test').Locator, value: number) {
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
