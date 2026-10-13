import type { Page } from '@playwright/test';
import { audio, expect, songPage, test } from './fixtures';

async function play(open: (h: string, html?: string) => Promise<Page>, host: string, title: string, artist = '') {
  const p = await open(host, songPage(title, artist));
  await audio(p).play();
  return p;
}

const mascot = (p: Page) => p.getByTestId('happydesk-mascot');

// The built-in pools (public/packs): every genre has two or more characters.
const JPOP = /^(hoshiri|qingge)$/;
const ROCK = /^(rina|raku)$/;
const LOFI = /^(mochi|viola)$/;
const CPOP = /^(qingge|aria)$/;
const VIDEO = /^(popo|tingting)$/;
// Built-in characters show their name in the interface language (Chinese in these specs).
const NAMES: Record<string, string> = { popo: '爆爆', tingting: '听听' };
/** The character drawn for what this page plays (not one still showing from the previous content). */
const packOf = async (p: Page) => {
  await expect(mascot(p)).toHaveAttribute('data-drawn', 'true');
  return (await mascot(p).getAttribute('data-pack'))!;
};

test('draws a character from the matching genre pool', async ({ open }) => {
  const jp = await play(open, 'jp.test', 'YOASOBI「アイドル」 Official Music Video', 'YOASOBI');
  await expect(mascot(jp)).toHaveAttribute('data-pack', JPOP);
  await audio(jp).pause();

  const rock = await play(open, 'rock.test', 'Linkin Park - Numb (Official Music Video)', 'Linkin Park');
  await expect(mascot(rock)).toHaveAttribute('data-pack', ROCK);
  // Every tab shows the current draw.
  await expect(mascot(jp)).toHaveAttribute('data-pack', await packOf(rock));
  await audio(rock).pause();

  const lofi = await play(open, 'lofi.test', 'lofi hip hop radio - beats to relax/study to', 'Lofi Girl');
  await expect(mascot(lofi)).toHaveAttribute('data-pack', LOFI);
  await audio(lofi).pause();

  const talk = await play(open, 'talk.test', 'How Transformers Work - A Visual Guide', '3Blue1Brown');
  await expect(mascot(talk)).toHaveAttribute('data-pack', VIDEO);
  const drawn = await packOf(talk);

  // Hover shows the tags and pack name.
  await mascot(talk).hover();
  await expect(talk.getByTestId('happydesk-gacha')).toContainText(NAMES[drawn]!);
  await expect(talk.getByTestId('happydesk-gacha')).toContainText('视频');
  // 换一次 goes to the other character of the pool, once.
  await talk.getByTestId('happydesk-reroll').click();
  await expect(mascot(talk)).toHaveAttribute('data-pack', drawn === 'popo' ? 'tingting' : 'popo');
  await expect(talk.getByTestId('happydesk-reroll')).toBeDisabled();
});

test('with no AI model connected, the built-in classifier picks the character', async ({ open, context }) => {
  // No API key or endpoint is set up in this profile: what is playing must not leave the browser.
  const titles = ['Wonderwall', 'Marianne', 'アイドル', 'Oasis', 'Fontaines'];
  const leaked: string[] = [];
  context.on('request', (r) => {
    if (!/^https?:/.test(r.url()) || /\.test\//.test(r.url())) return;
    const sent = decodeURIComponent(r.url()) + (r.postData() ?? '');
    if (titles.some((t) => sent.includes(t))) leaked.push(r.url());
  });

  // No song or genre words in the text: keyword rules alone took these for talk videos.
  const rock = await play(open, 'plain.test', 'Wonderwall - Remastered', 'Oasis');
  await expect(mascot(rock)).toHaveAttribute('data-pack', ROCK);
  await audio(rock).pause();

  const indie = await play(open, 'indie.test', 'Marianne', 'Fontaines D.C.');
  await expect(mascot(indie)).toHaveAttribute('data-pack', ROCK);
  await audio(indie).pause();

  const jp = await play(open, 'jpop.test', 'YOASOBI「アイドル」 Official Music Video', 'YOASOBI');
  await expect(mascot(jp)).toHaveAttribute('data-pack', JPOP);

  expect(leaked).toEqual([]);
});

test('same content does not redraw; returning to earlier content restores its character', async ({ open }) => {
  const a = await play(open, 'a.test', 'Linkin Park - Numb', 'Linkin Park');
  await expect(mascot(a)).toHaveAttribute('data-pack', ROCK);
  const first = await packOf(a);
  await audio(a).pause();
  await audio(a).play();
  await expect(mascot(a)).toHaveAttribute('data-pack', first);
  await audio(a).pause();
  const b = await play(open, 'b.test', '周杰伦《晴天》MV', '周杰伦');
  await expect(mascot(b)).toHaveAttribute('data-pack', CPOP);
  await audio(b).pause();
  await audio(a).play();
  await expect(mascot(a)).toHaveAttribute('data-pack', first);
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

  // Jazz ("other" genre) has no dedicated pool → generic pool = [kiki, petdex-blobby].
  const live = await play(open, 'jazz.test', 'Miles Davis - So What (Official Audio)', 'Miles Davis');
  await expect.poll(async () => mascot(live).getAttribute('data-pack')).toMatch(/^(kiki|petdex-blobby)$/);
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
  const other = drawn === 'kiki' ? 'petdex-blobby' : 'kiki';
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
  await expect(mascot(rock)).toHaveAttribute('data-pack', ROCK);
});

test('图鉴 records drawn characters', async ({ open, context, extensionId }) => {
  const a = await play(open, 'a.test', 'Linkin Park - Numb', 'Linkin Park');
  await expect(mascot(a)).toHaveAttribute('data-pack', ROCK);
  const rock = await packOf(a);
  await audio(a).pause();
  const b = await play(open, 'b.test', 'YOASOBI「アイドル」', 'YOASOBI');
  await expect(mascot(b)).toHaveAttribute('data-pack', JPOP);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#collection`);
  await expect(page.getByTestId('collection-progress')).toContainText('已收集 2 / 12');
  await expect(page.locator(`[data-testid="collection-card"][data-pack="${rock}"]`)).toHaveAttribute('data-collected', 'true');
  await expect(page.locator('[data-testid="collection-card"][data-pack="kiki"]')).toHaveAttribute('data-collected', 'false');
  await expect(page.locator('[data-testid="collection-card"][data-pack="kiki"]')).toContainText('？？？');
  await page.screenshot({ path: 'test-results/collection.png', fullPage: true });
});

test('图鉴: delete a character (it leaves the screen and the pools) and restore it', async ({ open, context, extensionId }) => {
  const a = await play(open, 'a.test', 'Linkin Park - Numb', 'Linkin Park');
  await expect(mascot(a)).toHaveAttribute('data-pack', ROCK);
  const first = await packOf(a);
  const other = first === 'rina' ? 'raku' : 'rina';

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#collection`);
  const card = (id: string) => page.locator(`[data-testid="collection-card"][data-pack="${id}"]`);
  await expect(page.getByTestId('collection-progress')).toContainText('已收集 1 / 12');

  // Asking first; 取消 leaves everything as it was.
  await card(first).getByTestId('collection-delete').click();
  await expect(card(first).getByTestId('collection-confirm')).toContainText('可以在页面底部恢复');
  await card(first).getByRole('button', { name: '取消' }).click();
  await expect(card(first).getByTestId('collection-confirm')).toHaveCount(0);

  await card(first).getByTestId('collection-delete').click();
  await card(first).getByTestId('collection-delete-yes').click();
  await expect(card(first)).toHaveCount(0);
  // The playing tab switches to the other rock character at once, and that draw is recorded.
  await expect(mascot(a)).toHaveAttribute('data-pack', other);
  await expect(page.getByTestId('collection-progress')).toContainText('已收集 1 / 11');
  await expect(page.locator(`[data-testid="collection-removed"][data-pack="${first}"]`)).toBeVisible();

  // New rock content can only draw what is left.
  await audio(a).pause();
  for (const [host, title] of [['b.test', 'Nirvana - Smells Like Teen Spirit'], ['c.test', 'Green Day - Basket Case']] as const) {
    const p = await play(open, host, title, 'Rock Band');
    await expect(mascot(p)).toHaveAttribute('data-drawn', 'true');
    await expect(mascot(p)).not.toHaveAttribute('data-pack', first);
    await audio(p).pause();
  }

  // A character never drawn can go too (asked for without naming it).
  await card('kiki').getByTestId('collection-delete').click();
  await expect(card('kiki').getByTestId('collection-confirm')).not.toContainText('Kiki');
  await card('kiki').getByTestId('collection-delete-yes').click();
  await expect(page.getByTestId('collection-removed')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/collection-deleted.png', fullPage: true });

  // Restore one, then the rest: the record of the first is still there.
  await page.locator(`[data-testid="collection-removed"][data-pack="${first}"]`).getByTestId('collection-restore').click();
  await expect(card(first)).toHaveAttribute('data-collected', 'true');
  await expect(card(first)).toContainText('抽到 1 次');
  await page.getByTestId('collection-restore-all').click();
  await expect(page.getByTestId('collection-removed')).toHaveCount(0);
  await expect(page.getByTestId('collection-progress')).toContainText('/ 12');
});

test('图鉴: an imported character is deleted for good', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await importSyntheticPet(page, extensionId, 'blobby');
  await page.getByRole('tab', { name: '图鉴' }).click();
  const card = page.locator('[data-testid="collection-card"][data-pack="petdex-blobby"]');
  await expect(page.getByTestId('collection-progress')).toContainText('/ 13');
  await card.getByTestId('collection-delete').click();
  await expect(card.getByTestId('collection-confirm')).toContainText('重新导入');
  await card.getByTestId('collection-delete-yes').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('collection-progress')).toContainText('/ 12');
  await expect(page.getByTestId('collection-removed')).toHaveCount(0);
  await page.getByRole('tab', { name: '导入角色' }).click();
  await expect(page.getByText('还没有导入任何角色')).toBeVisible();
});
