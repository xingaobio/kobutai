import { TONE_URL, audio, expect, setRange, test } from './fixtures';

test('overlay renders in a shadow root and follows playback', async ({ open }) => {
  const a = await open('a.test');
  const mascot = a.getByTestId('happydesk-mascot');
  await expect(mascot).toHaveAttribute('data-mood', 'idle');
  // Shadow DOM isolation: page CSS doesn't reach the overlay.
  const inShadow = await a.evaluate(() => {
    const host = document.querySelector('happydesk-overlay');
    return !!host?.shadowRoot?.querySelector('[data-testid="happydesk-mascot"]') && !document.querySelector('[data-testid="happydesk-mascot"]');
  });
  expect(inShadow).toBe(true);

  await audio(a).play();
  await expect(mascot).toHaveAttribute('data-mood', 'playing');
  await audio(a).pause();
  await expect(mascot).toHaveAttribute('data-mood', 'paused');
});

test('tab B controls media playing in tab A', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  const b = await open('b.test', '<!doctype html><title>B</title><p>no media here</p>');
  await expect(b.getByTestId('happydesk-mascot')).toHaveAttribute('data-mood', 'playing');

  await b.getByTestId('happydesk-mascot').hover();
  const bar = b.getByTestId('happydesk-controls');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('a.test');

  await b.getByTestId('happydesk-toggle').click();
  await expect.poll(async () => (await audio(a).state()).paused).toBe(true);
  await expect(b.getByTestId('happydesk-mascot')).toHaveAttribute('data-mood', 'paused');

  await setRange(bar.getByLabel('进度'), 2);
  await expect.poll(async () => Math.round((await audio(a).state()).currentTime)).toBe(2);

  await setRange(bar.getByLabel('音量'), 0.3);
  await expect.poll(async () => (await audio(a).state()).volume).toBeCloseTo(0.3);

  await bar.getByLabel('播放').click();
  await expect.poll(async () => (await audio(a).state()).paused).toBe(false);
});

test('latest playback becomes primary; dropdown switches source', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  const c = await open('c.test');
  await audio(c).play();
  await expect.poll(async () => (await audio(c).state()).paused).toBe(false);

  await c.getByTestId('happydesk-mascot').hover();
  const bar = c.getByTestId('happydesk-controls');
  const select = bar.getByLabel('切换媒体来源');
  await expect(select).toBeVisible();
  await expect(bar.locator('.title')).toHaveText('c.test');

  const aKey = await select.locator('option', { hasText: 'a.test' }).getAttribute('value');
  await select.selectOption(aKey!);
  await expect(bar.locator('.title')).toHaveText('a.test');
  await c.getByTestId('happydesk-toggle').click();
  await expect.poll(async () => (await audio(a).state()).paused).toBe(true);
  expect((await audio(c).state()).paused).toBe(false);
});

test('drag position persists per site', async ({ open }) => {
  const a = await open('a.test');
  const mascot = a.getByTestId('happydesk-mascot');
  const box = (await mascot.boundingBox())!;
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.mouse.down();
  await a.mouse.move(box.x - 300, box.y - 200, { steps: 8 });
  await a.mouse.up();
  const moved = (await mascot.boundingBox())!;
  expect(moved.x).toBeLessThan(box.x - 200);

  await a.reload();
  await mascot.waitFor();
  await expect.poll(async () => Math.round((await mascot.boundingBox())!.x)).toBe(Math.round(moved.x));

  // Other sites keep the default position.
  const d = await open('d.test');
  expect(Math.round((await d.getByTestId('happydesk-mascot').boundingBox())!.x)).toBe(Math.round(box.x));
});

test('resize handle scales the mascot', async ({ open }) => {
  const a = await open('a.test');
  const mascot = a.getByTestId('happydesk-mascot');
  const before = (await mascot.boundingBox())!;
  await mascot.hover();
  const handle = a.locator('happydesk-overlay .resize');
  const hb = (await handle.boundingBox())!;
  await a.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await a.mouse.down();
  await a.mouse.move(hb.x - 60, hb.y - 60, { steps: 6 });
  await a.mouse.up();
  const after = (await mascot.boundingBox())!;
  expect(after.width).toBeLessThan(before.width - 20);
});

test('hidden in fullscreen', async ({ open }) => {
  const a = await open('a.test');
  await a.locator('#fs').click();
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(0);
  await a.evaluate(() => document.exitFullscreen());
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(1);
});

test('hide on this site persists', async ({ open }) => {
  const a = await open('a.test');
  await a.getByTestId('happydesk-mascot').hover();
  await a.getByTestId('happydesk-controls').getByLabel('在此站点隐藏').click();
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(0);
  await a.reload();
  await a.waitForTimeout(1000);
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(0);
  const b = await open('b.test');
  await expect(b.getByTestId('happydesk-mascot')).toHaveCount(1);
});

test('main-world hook: detached audio + Media Session handlers (Spotify-style)', async ({ open }) => {
  const html = `<!doctype html><title>player</title><script>
    window.calls = [];
    window.player = new Audio(${JSON.stringify(TONE_URL)});
    window.player.loop = true;
    navigator.mediaSession.metadata = new MediaMetadata({ title: 'Detached Song', artist: 'Hook Band' });
    navigator.mediaSession.setActionHandler('nexttrack', () => window.calls.push('next'));
  </script><p>detached player</p>`;
  const p = await open('player.test', html);
  await p.evaluate(() => (window as unknown as { player: HTMLAudioElement }).player.play());
  const mascot = p.getByTestId('happydesk-mascot');
  await expect(mascot).toHaveAttribute('data-mood', 'playing');

  await mascot.hover();
  const bar = p.getByTestId('happydesk-controls');
  await expect(bar.locator('.title')).toHaveText('Detached Song');
  await expect(bar).toContainText('Hook Band');

  await bar.getByLabel('下一首').click();
  await expect.poll(() => p.evaluate(() => (window as unknown as { calls: string[] }).calls)).toEqual(['next']);

  await setRange(bar.getByLabel('音量'), 0.25);
  await expect.poll(() => p.evaluate(() => (window as unknown as { player: HTMLAudioElement }).player.volume)).toBeCloseTo(0.25);

  await p.getByTestId('happydesk-toggle').click();
  await expect.poll(() => p.evaluate(() => (window as unknown as { player: HTMLAudioElement }).player.paused)).toBe(true);
  await expect(mascot).toHaveAttribute('data-mood', 'paused');
});

test('screenshot', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  await a.getByTestId('happydesk-mascot').hover();
  await a.getByTestId('happydesk-controls').waitFor();
  await a.waitForTimeout(400);
  await a.screenshot({ path: 'test-results/overlay.png' });
});
