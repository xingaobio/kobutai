import { expect, songPage, audio, test } from './fixtures';

// Hits the real petdex.dev; run with PETDEX_LIVE=1.
test.skip(!process.env.PETDEX_LIVE, 'set PETDEX_LIVE=1 to run against petdex.dev');

test('imports a real Petdex pet and renders it', async ({ context, extensionId, open }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#import`);
  await page.getByRole('button', { name: '加载 Petdex 列表' }).click();
  await page.getByLabel('搜索 Petdex').fill('homelander');
  await page.locator('li', { hasText: 'Homelander' }).first().getByRole('button', { name: '导入' }).click();
  await expect(page.getByTestId('import-message')).toContainText('已导入', { timeout: 30_000 });
  const imported = page.locator('[data-testid="imported-pack"]');
  await expect(imported).toHaveCount(1);
  const id = (await imported.getAttribute('data-pack'))!;
  expect(id).toMatch(/^petdex-/);

  // Lock it from the 图鉴 so the overlay shows it everywhere.
  await page.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await page.evaluate((packId) => (globalThis as unknown as { chrome: typeof browser }).chrome.storage.sync.set({ lockedPack: packId }), id);
  const p = await open('a.test', songPage('anything'));
  await audio(p).play();
  await expect(p.getByTestId('happydesk-mascot')).toHaveAttribute('data-pack', id);
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
      { timeout: 15_000 },
    )
    .toBeGreaterThan(500);
  await p.getByTestId('happydesk-mascot').hover();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'test-results/petdex-live.png' });
});
