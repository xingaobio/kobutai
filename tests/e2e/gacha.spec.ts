import type { Page } from '@playwright/test';
import { audio, expect, songPage, test } from './fixtures';

async function play(open: (h: string, html?: string) => Promise<Page>, host: string, title: string, artist = '') {
  const p = await open(host, songPage(title, artist));
  await audio(p).play();
  return p;
}

const mascot = (p: Page) => p.getByTestId('happydesk-mascot');

test('draws a character from the matching genre pool', async ({ open }) => {
  const jp = await play(open, 'jp.test', 'YOASOBI「アイドル」 Official Music Video', 'YOASOBI');
  await expect(mascot(jp)).toHaveAttribute('data-pack', 'momo');
  await audio(jp).pause();

  const rock = await play(open, 'rock.test', 'Linkin Park - Numb (Official Music Video)', 'Linkin Park');
  await expect(mascot(rock)).toHaveAttribute('data-pack', 'rocky');
  // Every tab shows the current draw.
  await expect(mascot(jp)).toHaveAttribute('data-pack', 'rocky');
  await audio(rock).pause();

  const lofi = await play(open, 'lofi.test', 'lofi hip hop radio - beats to relax/study to', 'Lofi Girl');
  await expect(mascot(lofi)).toHaveAttribute('data-pack', 'nyan-lofi');
  await audio(lofi).pause();

  const talk = await play(open, 'talk.test', 'How Transformers Work - A Visual Guide', '3Blue1Brown');
  await expect(mascot(talk)).toHaveAttribute('data-pack', 'prof-blob');

  // Hover shows the tags and pack name.
  await mascot(talk).hover();
  await expect(talk.getByTestId('happydesk-gacha')).toContainText('讲解员 Blob');
  await expect(talk.getByTestId('happydesk-gacha')).toContainText('视频');
  // Single-pack pool: no reroll.
  await expect(talk.getByTestId('happydesk-reroll')).toBeDisabled();
});

test('same content does not redraw; returning to earlier content restores its character', async ({ open }) => {
  const a = await play(open, 'a.test', 'Linkin Park - Numb', 'Linkin Park');
  await expect(mascot(a)).toHaveAttribute('data-pack', 'rocky');
  await audio(a).pause();
  await audio(a).play();
  await expect(mascot(a)).toHaveAttribute('data-pack', 'rocky');
  await audio(a).pause();
  const b = await play(open, 'b.test', '周杰伦《晴天》MV', '周杰伦');
  await expect(mascot(b)).toHaveAttribute('data-pack', 'momo');
  await audio(b).pause();
  await audio(a).play();
  await expect(mascot(a)).toHaveAttribute('data-pack', 'rocky');
});

/** Build a small Petdex-style sheet (8×9 cells of 96×104) in the browser and import it via the options page. */
async function importSyntheticPet(page: Page, extensionId: string, name: string) {
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
  await expect(page.getByTestId('import-message')).toContainText('已导入');
  await expect(page.locator(`[data-testid="imported-pack"][data-pack="petdex-${name}"]`)).toBeVisible();
}

test('import a Petdex pet, reroll once within the pool, and lock', async ({ open, context, extensionId }) => {
  const opts = await context.newPage();
  await importSyntheticPet(opts, extensionId, 'blobby');

  // K-pop has no dedicated pool → generic pool = [pixel, petdex-blobby].
  const live = await play(open, 'kpop.test', "BTS (방탄소년단) 'Dynamite' Official MV", 'HYBE LABELS');
  await expect.poll(async () => mascot(live).getAttribute('data-pack')).toMatch(/^(pixel|petdex-blobby)$/);
  const drawn = (await mascot(live).getAttribute('data-pack'))!;

  // An imported (canvas-rendered) pet actually paints pixels.
  if (drawn === 'petdex-blobby') {
    await expect.poll(() =>
      live.evaluate(() => {
        const c = document.querySelector('happydesk-overlay')!.shadowRoot!.querySelector('canvas');
        if (!c) return 0;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
        return n;
      }),
    ).toBeGreaterThan(100);
  }

  await mascot(live).hover();
  const reroll = live.getByTestId('happydesk-reroll');
  await expect(reroll).toBeEnabled();
  await reroll.click();
  const other = drawn === 'pixel' ? 'petdex-blobby' : 'pixel';
  await expect(mascot(live)).toHaveAttribute('data-pack', other);
  await expect(reroll).toBeDisabled();

  // Lock: new content no longer changes the character.
  await live.getByTestId('happydesk-lock').click();
  await expect(live.getByTestId('happydesk-lock')).toHaveAttribute('aria-pressed', 'true');
  await audio(live).pause();
  const jp = await play(open, 'jp.test', 'YOASOBI「アイドル」', 'YOASOBI');
  await jp.waitForTimeout(800);
  await expect(mascot(jp)).toHaveAttribute('data-pack', other);
  await mascot(jp).hover();
  await expect(jp.getByTestId('happydesk-reroll')).toBeDisabled();

  // Unlock → next new content draws again.
  await jp.getByTestId('happydesk-lock').click();
  await audio(jp).pause();
  const rock = await play(open, 'rock.test', 'Linkin Park - Numb', 'Linkin Park');
  await expect(mascot(rock)).toHaveAttribute('data-pack', 'rocky');
});

test('图鉴 records drawn characters', async ({ open, context, extensionId }) => {
  const a = await play(open, 'a.test', 'Linkin Park - Numb', 'Linkin Park');
  await expect(mascot(a)).toHaveAttribute('data-pack', 'rocky');
  await audio(a).pause();
  const b = await play(open, 'b.test', 'YOASOBI「アイドル」', 'YOASOBI');
  await expect(mascot(b)).toHaveAttribute('data-pack', 'momo');

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#collection`);
  await expect(page.getByTestId('collection-progress')).toContainText('已收集 2 / 5');
  await expect(page.locator('[data-testid="collection-card"][data-pack="rocky"]')).toHaveAttribute('data-collected', 'true');
  await expect(page.locator('[data-testid="collection-card"][data-pack="pixel"]')).toHaveAttribute('data-collected', 'false');
  await expect(page.locator('[data-testid="collection-card"][data-pack="pixel"]')).toContainText('？？？');
  await page.screenshot({ path: 'test-results/collection.png', fullPage: true });
});
