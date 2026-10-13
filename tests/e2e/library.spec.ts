import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { audio, expect, songPage, test } from './fixtures';

const LIB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../library');
const PREFIX = 'https://raw.githubusercontent.com/xingaobio/happydesk/main/library/';

async function serveLibrary(page: Page, mode: 'online' | 'offline' | 'flaky') {
  await page.unroute(`${PREFIX}**`);
  await page.route(`${PREFIX}**`, (route) => {
    if (mode === 'offline') return route.abort('internetdisconnected');
    // One pack's sheet fails transiently (e.g. a 429 from GitHub).
    if (mode === 'flaky' && route.request().url().endsWith('idol-star/sheet.png')) return route.fulfill({ status: 429, body: '' });
    const rel = route.request().url().slice(PREFIX.length);
    try {
      // GitHub raw serves everything as text/plain.
      return route.fulfill({ body: readFileSync(path.join(LIB, rel)), contentType: 'text/plain; charset=utf-8' });
    } catch {
      return route.fulfill({ status: 404, body: '404: Not Found' });
    }
  });
}

test('remote library: download, draw, keep offline', async ({ context, extensionId, open }) => {
  const opts = await context.newPage();
  await serveLibrary(opts, 'online');
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await opts.getByTestId('sync-now').click();
  await expect(opts.getByTestId('sync-status')).toContainText('成功');
  await expect(opts.getByTestId('remote-count')).toHaveText('2');

  // Remote packs join the 图鉴 and the pools.
  await opts.getByRole('tab', { name: '图鉴' }).click();
  await expect(opts.getByTestId('collection-progress')).toContainText('/ 14');

  // Lock a remote character and check the overlay paints it from IndexedDB.
  await opts.evaluate(() => (globalThis as unknown as { chrome: typeof browser }).chrome.storage.sync.set({ lockedPack: 'dj-neko' }));
  const p = await open('a.test', songPage('Alan Walker - Faded', 'Alan Walker'));
  await audio(p).play();
  await expect(p.getByTestId('happydesk-mascot')).toHaveAttribute('data-pack', 'dj-neko');
  await expect
    .poll(() =>
      p.evaluate(() => {
        const c = document.querySelector('happydesk-overlay')!.shadowRoot!.querySelector('canvas');
        if (!c) return 0;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
        return n;
      }),
    )
    .toBeGreaterThan(500);

  // Offline sync fails but keeps the cached characters.
  await serveLibrary(opts, 'offline');
  await opts.getByRole('tab', { name: '设置' }).click();
  await opts.getByTestId('sync-now').click();
  await expect(opts.getByTestId('sync-status')).toContainText('失败');
  await expect(opts.getByTestId('remote-count')).toHaveText('2');
  await p.reload();
  await audio(p).play();
  await expect(p.getByTestId('happydesk-mascot')).toHaveAttribute('data-pack', 'dj-neko');
});

test('a library that serves an invalid index is reported, not fatal', async ({ context, extensionId }) => {
  const opts = await context.newPage();
  await opts.route('https://bad.example/**', (r) => r.fulfill({ body: '{"packs": ["../../etc"]}', contentType: 'application/json' }));
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  // Replace the default library with the bad one.
  await opts.evaluate(() =>
    (globalThis as unknown as { chrome: typeof browser }).chrome.storage.local.set({ libraries: ['https://bad.example/index.json'] }),
  );
  await opts.getByTestId('sync-now').click();
  await expect(opts.getByTestId('sync-status')).toContainText('失败');
  await opts.getByText(/个问题/).click();
  await expect(opts.locator('ul.errors')).toContainText('invalid pack id');
});

test('remote library: a transient per-pack failure keeps the cached pack; removing the library drops its packs', async ({ context, extensionId }) => {
  const opts = await context.newPage();
  await serveLibrary(opts, 'online');
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await opts.getByTestId('sync-now').click();
  await expect(opts.getByTestId('remote-count')).toHaveText('2');

  await serveLibrary(opts, 'flaky');
  await opts.getByTestId('sync-now').click();
  await expect(opts.getByTestId('sync-status')).toContainText('成功');
  await opts.getByText(/个问题/).click();
  await expect(opts.locator('ul.errors')).toContainText('idol-star');
  await expect(opts.getByTestId('remote-count')).toHaveText('2');
  // The cached sheet of the failed pack was not garbage-collected.
  const remoteBlobs = () =>
    opts.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const req = indexedDB.open('happydesk');
          req.onsuccess = () => {
            const keys = req.result.transaction('blobs').objectStore('blobs').getAllKeys();
            keys.onsuccess = () => resolve(keys.result.filter((k) => String(k).startsWith('remote-')).length);
          };
        }),
    );
  expect(await remoteBlobs()).toBe(2);

  await opts.getByTestId('library').getByRole('button', { name: '移除' }).click();
  await expect(opts.getByTestId('remote-count')).toHaveText('0');
  await expect.poll(remoteBlobs).toBe(0);
});
