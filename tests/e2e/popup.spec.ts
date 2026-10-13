import type { Page } from '@playwright/test';
import { audio, expect, songPage, test } from './fixtures';

const shot = (p: Page, name: string) => p.screenshot({ path: `test-results/${name}.png`, fullPage: true });

test('toolbar popup: a page that cannot show characters, then a small player for what plays in another tab', async ({ context, extensionId, open }) => {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 320, height: 640 });
  // Opened as a tab, the popup's "current tab" is itself: an extension page, where no character can show.
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByTestId('popup-unsupported')).toContainText('这个页面不能显示角色');
  await expect(popup.getByText('图鉴已收集')).toContainText('0 / 12');
  await shot(popup, 'popup-unsupported');

  const song = await open('rock.test', songPage('Linkin Park - Numb (Official Music Video)', 'Linkin Park'));
  await audio(song).play();
  await expect(song.getByTestId('happydesk-mascot')).toHaveAttribute('data-drawn', 'true');
  const drawn = (await song.getByTestId('happydesk-mascot').getAttribute('data-pack'))!;

  const now = popup.getByTestId('popup-now');
  await expect(now).toBeVisible();
  await expect(now).toContainText(drawn === 'rina' ? '莉娜' : '乐酷');
  await expect(now).toContainText('摇滚');
  await expect(popup.getByText('Linkin Park - Numb')).toBeVisible();
  await popup.waitForTimeout(400);
  await shot(popup, 'popup-playing');

  // Controls reach the tab that plays.
  await popup.getByTestId('popup-toggle').click();
  await expect.poll(async () => (await audio(song).state()).paused).toBe(true);
  await popup.getByTestId('popup-toggle').click();
  await expect.poll(async () => (await audio(song).state()).paused).toBe(false);

  // 换一次 once, then lock; the page's overlay follows.
  await popup.getByTestId('popup-reroll').click();
  await expect(song.getByTestId('happydesk-mascot')).toHaveAttribute('data-pack', drawn === 'rina' ? 'raku' : 'rina');
  await expect(popup.getByTestId('popup-reroll')).toBeDisabled();
  await popup.getByTestId('popup-lock').click();
  await expect(popup.getByTestId('popup-lock')).toHaveAttribute('aria-pressed', 'true');
  await expect(now).toContainText('已锁定');
});

test('control bar says how the character was chosen', async ({ open }) => {
  const p = await open('rock.test', songPage('Linkin Park - Numb (Official Music Video)', 'Linkin Park'));
  await audio(p).play();
  const mascot = p.getByTestId('happydesk-mascot');
  await expect(mascot).toHaveAttribute('data-drawn', 'true');
  await mascot.hover();
  // No model connected: the local rules decided, so a plain genre label.
  await expect(p.getByTestId('happydesk-badge')).toHaveText('摇滚');
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'test-results/control-bar.png' });
});

test('options pages render in the Kobutai style', async ({ context, extensionId }) => {
  const opts = await context.newPage();
  await opts.setViewportSize({ width: 1280, height: 900 });
  for (const tab of ['collection', 'import', 'models', 'settings']) {
    await opts.goto(`chrome-extension://${extensionId}/options.html#${tab}`);
    await opts.reload();
    await expect(opts.getByRole('tab', { selected: true })).toBeVisible();
    await opts.waitForTimeout(300);
    await shot(opts, `options-${tab}`);
  }
  // Links like "导入我自己的角色" switch the tab.
  await opts.goto(`chrome-extension://${extensionId}/options.html#collection`);
  await opts.getByRole('link', { name: '导入我自己的角色' }).click();
  await expect(opts.getByRole('tab', { name: '导入角色' })).toHaveAttribute('aria-selected', 'true');
  await expect(opts.getByTestId('auto-match')).not.toBeChecked();
  // The display font is bundled, not fetched.
  expect(await opts.evaluate(() => document.fonts.check('20px "Kobutai Display"', '图鉴'))).toBe(true);
});
