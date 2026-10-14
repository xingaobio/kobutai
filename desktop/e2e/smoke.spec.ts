import { expect, test, type Page } from '@playwright/test';

/**
 * The overlay page in Chromium with a stand-in for Tauri's IPC layer (the same hooks
 * @tauri-apps/api uses: window.__TAURI_INTERNALS__.invoke / transformCallback). The "Rust side" is
 * play-acted by the test: it emits media://sessions and records every command it receives.
 *
 * KOBUTAI_SMOKE_SHOT=<path> saves a screenshot.
 */

interface Stub {
  calls: { cmd: string; args: any }[];
  emit(event: string, payload: unknown): void;
  listening(event: string): boolean;
}
declare global {
  interface Window {
    __stub: Stub;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, (e: unknown) => void>();
    const listeners = new Map<string, number[]>();
    let next = 1;
    const calls: Stub['calls'] = [];
    (window as any).__TAURI_INTERNALS__ = {
      transformCallback: (cb: (e: unknown) => void) => {
        callbacks.set(next, cb);
        return next++;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (cmd: string, args: any) => {
        if (cmd === 'plugin:event|listen') {
          listeners.set(args.event, [...(listeners.get(args.event) ?? []), args.handler]);
          return args.handler;
        }
        if (cmd.startsWith('plugin:event|')) return null;
        calls.push({ cmd, args });
        if (cmd === 'media_sessions') return { sessions: [], currentId: null };
        return undefined;
      },
    };
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    window.__stub = {
      calls,
      listening: (event) => (listeners.get(event)?.length ?? 0) > 0,
      emit: (event, payload) => {
        for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id, payload });
      },
    };
  });
});

const spotify = {
  id: 'Spotify.exe',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  albumTitle: 'A Night at the Opera',
  playing: true,
  position: 42,
  duration: 355,
  canPlay: true,
  canPause: true,
  canNext: true,
  canPrev: true,
  canSeek: true,
};

const hitCalls = (page: Page) => page.evaluate(() => window.__stub.calls.filter((c) => c.cmd === 'set_hit_regions').map((c) => c.args.rects as { x: number; y: number; w: number; h: number }[]));

test('a playing Spotify session shows a character and reports where the mouse must reach it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');

  // Nothing plays yet: the stage is empty and the whole window is click-through.
  await page.waitForFunction(() => window.__stub.listening('media://sessions'));
  await expect.poll(() => hitCalls(page).then((c) => c.at(-1))).toEqual([]);
  await expect(page.getByTestId('happydesk-mascot')).toHaveCount(0);

  await page.evaluate((s) => window.__stub.emit('media://sessions', { sessions: [s], currentId: s.id }), spotify);

  const mascot = page.getByTestId('happydesk-mascot');
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveAttribute('data-pack', /.+/);
  await expect(mascot).toHaveAttribute('data-mood', 'playing');
  await expect(mascot.locator('canvas').first()).toBeAttached();

  // The character's rectangle was reported, matching where it is on the page.
  await expect.poll(() => hitCalls(page).then((c) => c.at(-1)?.length)).toBe(1);
  const [rect] = (await hitCalls(page)).at(-1)!;
  const box = (await page.getByTestId('happydesk-overlay').boundingBox())!;
  expect(rect!.w).toBeGreaterThan(50);
  expect(Math.abs(rect!.x - box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(rect!.y - box.y)).toBeLessThanOrEqual(1);

  // Transparent page, so the desktop shows through.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  // Hover: the control bar appears and its (padded) rectangle joins the report.
  await mascot.hover();
  const bar = page.getByTestId('happydesk-controls');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Bohemian Rhapsody');
  await expect(bar).toContainText('Queen');
  await expect.poll(() => hitCalls(page).then((c) => c.at(-1)?.length)).toBeGreaterThanOrEqual(2);
  const rects = (await hitCalls(page)).at(-1)!;
  const barBox = (await bar.boundingBox())!;
  const barRect = rects.find((r) => r.w >= 300)!;
  expect(barRect.x).toBeLessThanOrEqual(Math.floor(barBox.x));
  expect(barRect.y + barRect.h).toBeGreaterThanOrEqual(Math.ceil(barBox.y + barBox.height));
  // No volume or mute (system sessions have none), no hide-this-site, no PiP.
  await expect(bar.getByRole('slider', { name: /volume|音量/i })).toHaveCount(0);
  await expect(bar.locator('input.volume')).toHaveCount(0);
  await expect(bar.getByRole('button', { name: /mute|静音|ミュート/i })).toHaveCount(0);
  await expect(bar.getByTestId('happydesk-pip-open')).toHaveCount(0);
  await expect(bar.locator('.row')).toHaveCount(0);

  // Controls reach the "Rust side" as DesktopCommands for that session.
  await bar.getByTestId('happydesk-toggle').click();
  await bar.getByRole('button', { name: /next|下一/i }).click();
  const commands = await page.evaluate(() => window.__stub.calls.filter((c) => c.cmd === 'media_command').map((c) => c.args));
  expect(commands).toEqual([
    { id: 'Spotify.exe', cmd: { type: 'pause' } },
    { id: 'Spotify.exe', cmd: { type: 'next' } },
  ]);

  if (process.env.KOBUTAI_SMOKE_SHOT) {
    // The page itself is transparent; show it over something so the screenshot is readable.
    await page.addStyleTag({ content: 'html { background: linear-gradient(135deg, #2b5876, #4e4376) !important; }' });
    await page.screenshot({ path: process.env.KOBUTAI_SMOKE_SHOT });
  }

  // The window went click-through under the cursor (Rust: overlay://cursor inside:false), so no
  // pointerleave will come from the browser: the overlay must end the hover itself.
  await page.waitForFunction(() => window.__stub.listening('overlay://cursor'));
  await page.evaluate(() => window.__stub.emit('overlay://cursor', { inside: true }));
  await page.waitForTimeout(600);
  await expect(bar).toBeVisible(); // inside:true changes nothing
  await page.evaluate(() => window.__stub.emit('overlay://cursor', { inside: false }));
  await expect(bar).toHaveCount(0);
  await expect(mascot).toBeVisible();
  // The bar's rectangle is gone from the report; the character's stays.
  await expect.poll(() => hitCalls(page).then((c) => c.at(-1)?.length)).toBe(1);

  // The session ends: the character leaves and the window turns click-through again.
  await page.evaluate(() => window.__stub.emit('media://sessions', { sessions: [], currentId: null }));
  await page.mouse.move(5, 5);
  await expect.poll(() => hitCalls(page).then((c) => c.at(-1)?.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('the character can be dragged and its position is remembered', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__stub.listening('media://sessions'));
  await page.evaluate((s) => window.__stub.emit('media://sessions', { sessions: [s], currentId: s.id }), spotify);
  const root = page.getByTestId('happydesk-overlay');
  await expect(root).toBeVisible();
  const before = (await root.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 200, before.y + before.height / 2 - 120, { steps: 6 });
  await page.mouse.up();
  const after = (await root.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 150);
  // Saved under the desktop's own layout key (localStorage), and the reported rectangle followed.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('local:layout2:desktop') ?? 'null'));
  expect(saved).toMatchObject({ x: Math.round(after.x), y: Math.round(after.y) });
  await expect.poll(() => hitCalls(page).then((c) => Math.round(c.at(-1)![0]!.x))).toBe(Math.round(after.x));

  await page.reload();
  await page.waitForFunction(() => window.__stub.listening('media://sessions'));
  await page.evaluate((s) => window.__stub.emit('media://sessions', { sessions: [s], currentId: s.id }), spotify);
  await expect(root).toBeVisible();
  const reloaded = (await root.boundingBox())!;
  expect(Math.abs(reloaded.x - after.x)).toBeLessThanOrEqual(1);
});
