import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzip } from '../../src/lib/share/zip';
import { audio, expect, songPage, test } from './fixtures';

const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/${name}.png`, fullPage: true });

test('switch the interface to English and Japanese everywhere', async ({ context, extensionId, open }) => {
  const opts = await context.newPage();
  await opts.setViewportSize({ width: 1280, height: 900 });
  await opts.goto(`chrome-extension://${extensionId}/options.html#collection`);
  await expect(opts.locator('[data-tab="collection"]')).toHaveText('图鉴');

  await opts.getByTestId('lang-switch').locator('[data-lang="en"]').click();
  await expect(opts.locator('[data-tab="collection"]')).toHaveText('Album');
  await expect(opts.locator('h1')).toHaveText('Album');
  await expect(opts.getByTestId('collection-progress')).toContainText('Collected 0 / 12');
  await expect(opts.locator('html')).toHaveAttribute('lang', 'en');
  for (const tab of ['collection', 'import', 'models', 'settings']) {
    await opts.locator(`[data-tab="${tab}"]`).click();
    await opts.waitForTimeout(250);
    await shot(opts, `options-en-${tab}`);
  }
  // The choice is saved.
  await opts.reload();
  await expect(opts.locator('[data-tab="settings"]')).toHaveText('Settings');

  // The on-page controls and the toolbar popup follow.
  const song = await open('rock.test', songPage('Linkin Park - Numb (Official Music Video)', 'Linkin Park'));
  await audio(song).play();
  const mascot = song.getByTestId('happydesk-mascot');
  await expect(mascot).toHaveAttribute('data-drawn', 'true');
  await mascot.hover();
  await expect(song.getByTestId('happydesk-badge')).toHaveText('Rock');
  await expect(song.getByTestId('happydesk-reroll')).toHaveText('Draw again');
  await song.waitForTimeout(300);
  await song.screenshot({ path: 'test-results/control-bar-en.png' });

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 320, height: 640 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByTestId('popup-now')).toContainText(/Rina|Raku/);
  await expect(popup.getByTestId('popup-now')).toContainText('Rock');
  await expect(popup.getByTestId('popup-reroll')).toContainText('Draw again');
  await popup.waitForTimeout(300);
  await shot(popup, 'popup-en');

  // Japanese from the Settings page; open pages switch without a reload.
  await opts.locator('[data-tab="settings"]').click();
  await opts.getByTestId('lang-ja').check();
  await expect(opts.locator('[data-tab="collection"]')).toHaveText('アルバム');
  await expect(popup.getByTestId('popup-lock')).toContainText('ロック');
  await mascot.hover();
  await expect(song.getByTestId('happydesk-badge')).toHaveText('ロック');
  await opts.locator('[data-tab="collection"]').click();
  await opts.waitForTimeout(250);
  await shot(opts, 'options-ja-collection');
  await shot(popup, 'popup-ja');

  // Back to following the browser (Chinese here).
  await opts.locator('[data-tab="settings"]').click();
  await opts.getByTestId('lang-auto').check();
  await expect(opts.locator('[data-tab="collection"]')).toHaveText('图鉴');
});

/** A small Petdex-style sheet (8×9 cells of 96×104), imported as the user's own file. */
async function importOwn(page: Page, extensionId: string, name: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html#import`);
  const png = await page.evaluate(async () => {
    const c = new OffscreenCanvas(96 * 8, 104 * 9);
    const ctx = c.getContext('2d')!;
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 6; col++) {
        ctx.fillStyle = `hsl(${row * 40} 80% 60%)`;
        ctx.beginPath();
        ctx.arc(col * 96 + 48, row * 104 + 60 - (col % 3) * 6, 30, 0, Math.PI * 2);
        ctx.fill();
      }
    const blob = await c.convertToBlob({ type: 'image/png' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByTestId('import-files').setInputFiles([
    { name: 'pet.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ id: name, displayName: name })) },
    { name: 'spritesheet.png', mimeType: 'image/png', buffer: Buffer.from(png) },
  ]);
  await expect(page.locator(`[data-testid="imported-pack"][data-pack="petdex-${name}"]`)).toBeVisible();
}

test('share a character I drew: a CC BY 4.0 package and a pre-filled GitHub submission', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await importOwn(page, extensionId, 'blobby');
  await expect(page.getByTestId('import-message')).toContainText('分享给大家');

  await page.getByTestId('share-open').click();
  const dialog = page.getByTestId('share-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('share-name')).toHaveValue('blobby');
  await dialog.getByTestId('share-name').fill('Blobby');
  // Nothing is made without a name to credit and the license agreement.
  await expect(dialog.getByTestId('share-make')).toBeDisabled();
  await dialog.getByTestId('share-author').fill('Mika');
  await dialog.getByText('Lo-fi').click();
  await expect(dialog.getByTestId('share-make')).toBeDisabled();
  await dialog.getByTestId('share-consent').check();
  await page.waitForTimeout(200);
  await shot(page, 'share-dialog');

  const download = page.waitForEvent('download');
  await dialog.getByTestId('share-make').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('kobutai-blobby.zip');
  const entries = unzip(new Uint8Array(await readFile((await file.path())!)));
  expect(entries.map((e) => e.name)).toEqual(['blobby/pack.json', 'blobby/sheet.png', 'blobby/CREDITS.txt']);
  const pack = JSON.parse(new TextDecoder().decode(entries[0]!.data));
  expect(pack).toMatchObject({ id: 'blobby', name: 'Blobby', author: 'Mika', license: 'CC BY 4.0', tags: { genre: ['lofi'] } });
  expect(pack.states.idle.src).toBe('sheet.png');

  await expect(dialog.getByTestId('share-done')).toContainText('kobutai-blobby.zip');
  await page.waitForTimeout(200);
  await shot(page, 'share-done');

  // GitHub route: a pre-filled issue form (the network is not needed to check the address).
  await context.route('https://github.com/**', (r) => r.fulfill({ body: 'ok' }));
  const tab = context.waitForEvent('page');
  await dialog.getByTestId('share-github').click();
  const gh = new URL((await tab).url());
  expect(gh.pathname).toBe('/xingaobio/kobutai/issues/new');
  expect(gh.searchParams.get('template')).toBe('character.yml');
  expect(gh.searchParams.get('author')).toBe('Mika');
  expect(gh.searchParams.get('file')).toBe('kobutai-blobby.zip');

  // The author name is remembered for the next submission.
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByTestId('share-open').click();
  await expect(page.getByTestId('share-author')).toHaveValue('Mika');
});
