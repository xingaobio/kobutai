import { TONE_URL, audio, expect, setRange, songPage, test } from './fixtures';

test('overlay renders in a shadow root and follows playback', async ({ open }) => {
  const a = await open('a.test');
  const mascot = a.getByTestId('happydesk-mascot');
  // Nothing playing yet: no character.
  await a.waitForTimeout(500);
  await expect(mascot).toHaveCount(0);
  await audio(a).play();
  await expect(mascot).toHaveAttribute('data-mood', 'playing');
  // Shadow DOM isolation: page CSS doesn't reach the overlay.
  const inShadow = await a.evaluate(() => {
    const host = document.querySelector('happydesk-overlay');
    return !!host?.shadowRoot?.querySelector('[data-testid="happydesk-mascot"]') && !document.querySelector('[data-testid="happydesk-mascot"]');
  });
  expect(inShadow).toBe(true);

  // Paused: it stays (dimmed) for a while so playback can be resumed from it.
  await audio(a).pause();
  await expect(mascot).toHaveAttribute('data-mood', 'paused');
});

test('the character shows only around sound, like Chrome\'s media button; "always" brings back the old behaviour', async ({ context, extensionId, open }) => {
  const a = await open('a.test');
  const b = await open('b.test');
  const onA = a.getByTestId('happydesk-mascot');
  const onB = b.getByTestId('happydesk-mascot');
  await expect(onB).toHaveCount(0);
  // Muted autoplay (a video preview) doesn't count.
  await a.evaluate(() => ((document.getElementById('media') as HTMLAudioElement).muted = true));
  await audio(a).play();
  await b.waitForTimeout(1500);
  await expect(onB).toHaveCount(0);
  // Sound in tab A: the character shows on every page.
  await a.evaluate(() => ((document.getElementById('media') as HTMLAudioElement).muted = false));
  await expect(onA).toHaveCount(1);
  await expect(onB).toHaveCount(1);
  // Closing the tab that played: gone at once.
  await a.close();
  await expect(onB).toHaveCount(0);

  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await expect(opts.getByTestId('show-when-playing')).toBeChecked();
  await opts.getByTestId('show-when-always').check();
  await expect(onB).toHaveAttribute('data-mood', 'idle');
});

test('the character bobs while playing, and freezes and fades when paused', async ({ open }) => {
  const a = await open('a.test');
  const mascot = a.getByTestId('happydesk-mascot');
  /** The character element, the animation frame it shows and its motion styles. */
  const look = () =>
    a.evaluate(() => {
      const el = document.querySelector('happydesk-overlay')!.shadowRoot!.querySelector('.character') as HTMLElement;
      const sprite = el.firstElementChild as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        playing: el.classList.contains('playing'),
        paused: el.classList.contains('paused'),
        bobbing: cs.animationName !== 'none',
        faded: cs.filter !== 'none' && Number(cs.opacity) < 1,
        frame: sprite.style.backgroundPosition,
      };
    });
  /** Distinct frames seen over ~1.2 s. */
  const frames = async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add((await look()).frame);
      await a.waitForTimeout(100);
    }
    return seen.size;
  };

  await audio(a).play();
  await expect(mascot).toHaveAttribute('data-mood', 'playing');
  // The one-shot "appear" animation runs first; then the looping playing frames.
  await expect.poll(async () => (await look()).bobbing).toBe(true);
  expect(await look()).toMatchObject({ playing: true, paused: false, faded: false });
  await expect.poll(frames, { timeout: 10_000 }).toBeGreaterThan(1);

  await audio(a).pause();
  await expect(mascot).toHaveAttribute('data-mood', 'paused');
  await expect.poll(async () => (await look()).faded).toBe(true);
  expect(await look()).toMatchObject({ playing: false, paused: true, bobbing: false });
  await expect.poll(frames, { timeout: 10_000 }).toBe(1);

  // Resuming brings the motion back.
  await audio(a).play();
  await expect.poll(async () => (await look()).bobbing).toBe(true);
  await expect.poll(frames, { timeout: 10_000 }).toBeGreaterThan(1);

  // "Reduce motion" in the OS: no bob (the pack's own frames still play).
  await a.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await look()).bobbing).toBe(false);
  expect((await look()).playing).toBe(true);
});

test('emoji bubble: what is playing on a new track, 😴 on pause; can be switched off', async ({
  context,
  extensionId,
  open,
}) => {
  test.setTimeout(60_000);
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await expect(opts.getByTestId('bubble-style-mix')).toBeChecked();
  // Encores in a long play are on by default, and the choice sticks (their timing: lib/emoji/encore.test.ts).
  await expect(opts.getByTestId('encore-often')).toBeChecked();
  await opts.getByTestId('encore-sometimes').check();
  await opts.reload();
  await expect(opts.getByTestId('encore-sometimes')).toBeChecked();
  await opts.getByTestId('bubble-style-emoji').check();
  // Lines are their own test (below): here the bubble is only emoji.
  await opts.getByTestId('talk-off').check();
  const a = await open('rock.test', songPage('Linkin Park - Numb (Official Music Video)', 'Linkin Park'));
  const bubble = a.getByTestId('happydesk-bubble');
  await expect(bubble).toHaveCount(0);

  await audio(a).play();
  await expect(bubble).toHaveAttribute('data-emoji', /^(guitar|rock-hand)$/);
  // The emoji is animated: its frame changes while it is up.
  const frame = () =>
    a.evaluate(() => {
      const el = document.querySelector('happydesk-overlay')!.shadowRoot!.querySelector('[data-testid="happydesk-bubble"] .scaler > div');
      return (el as HTMLElement | null)?.style.backgroundPosition ?? '';
    });
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    seen.add(await frame());
    await a.waitForTimeout(120);
  }
  expect(seen.size).toBeGreaterThan(1);
  // It goes away by itself.
  await expect(bubble).toHaveCount(0, { timeout: 8_000 });

  await audio(a).pause();
  await expect(bubble).toHaveAttribute('data-emoji', 'sleepy');
  // (🥳 on 换一次 is checked in match-live.spec.ts.)

  // Title words beat the genre.
  await audio(a).pause();
  const b = await open('bday.test', songPage('Happy Birthday to You', 'Kids Songs'));
  await audio(b).play();
  await expect(b.getByTestId('happydesk-bubble')).toHaveAttribute('data-emoji', 'cake');

  // Off in the settings: no more bubbles.
  await expect(opts.getByTestId('emoji-bubbles')).toBeChecked();
  await opts.getByTestId('emoji-bubbles').uncheck();
  await audio(b).pause();
  const c = await open('lofi.test', songPage('lofi hip hop radio - beats to relax/study to', 'Lofi Girl'));
  await audio(c).play();
  await expect(c.getByTestId('happydesk-mascot')).toHaveAttribute('data-mood', 'playing');
  await c.waitForTimeout(2500);
  await expect(c.getByTestId('happydesk-bubble')).toHaveCount(0);
});

test('kaomoji bubble: 颜文字 that say the same thing as the emoji would', async ({ context, extensionId, open }) => {
  test.setTimeout(60_000);
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await opts.getByTestId('bubble-style-kaomoji').check();
  await opts.getByTestId('talk-off').check();
  const a = await open('rock.test', songPage('Linkin Park - Numb (Official Music Video)', 'Linkin Park'));
  const bubble = a.getByTestId('happydesk-bubble');
  await audio(a).play();
  await expect(bubble).toHaveAttribute('data-kind', 'kaomoji');
  await expect(bubble).toHaveAttribute('data-emoji', /^(guitar|rock-hand)$/);
  const text = (await bubble.getAttribute('data-kaomoji'))!;
  expect(text).toContain('m/');
  await expect(bubble).toHaveText(text);
  // A pill wide enough for the text, still inside the screen.
  const box = (await bubble.boundingBox())!;
  expect(box.width).toBeGreaterThan(box.height * 1.5);
  expect(box.x + box.width).toBeLessThanOrEqual(1200);
  await a.screenshot({ path: 'test-results/kaomoji.png' });
  await audio(a).pause();
  await expect(bubble).toHaveAttribute('data-kaomoji', /^\(｡-ω-\)zzZ|\(_ _\)\.｡o○$/);
});

test('character lines: the drawn character says something that fits, a tap gets a reply', async ({ context, extensionId, open }) => {
  test.setTimeout(60_000);
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#settings`);
  await expect(opts.getByTestId('talk-normal')).toBeChecked();
  const a = await open('rock.test', songPage('Linkin Park - Numb (Official Music Video)', 'Linkin Park'));
  const bubble = a.getByTestId('happydesk-bubble');
  await audio(a).play();
  // The first thing a new track gets is a line in the character's voice.
  await expect(bubble).toHaveAttribute('data-kind', 'line');
  const line = (await bubble.getAttribute('data-line'))!;
  expect(line.length).toBeGreaterThan(0);
  await expect(bubble).toHaveText(line);
  const box = (await bubble.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(1200);
  await a.screenshot({ path: 'test-results/line.png' });
  // Within the cooldown the pause gets the usual 😴, not a second line.
  await expect(bubble).toHaveCount(0, { timeout: 8_000 });
  await audio(a).pause();
  await expect(bubble).toHaveAttribute('data-emoji', 'sleepy');
  await expect(bubble).not.toHaveAttribute('data-kind', 'line');
  // A tap always gets a line.
  await a.getByTestId('happydesk-mascot').click();
  await expect(bubble).toHaveAttribute('data-kind', 'line');

  await expect(bubble).toHaveCount(0, { timeout: 8_000 });

  // Off: back to emoji and kaomoji only (a tap has nothing to say then).
  await opts.getByTestId('talk-off').check();
  await a.getByTestId('happydesk-mascot').click();
  await a.waitForTimeout(800);
  await expect(bubble).toHaveCount(0);
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
  await audio(a).play();
  const mascot = a.getByTestId('happydesk-mascot');
  // Measure the character drawn for this page, not one shown while the draw is on its way.
  await expect(mascot).toHaveAttribute('data-drawn', 'true');
  const box = (await mascot.boundingBox())!;
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.mouse.down();
  await a.mouse.move(box.x - 300, box.y - 200, { steps: 8 });
  await a.mouse.up();
  const moved = (await mascot.boundingBox())!;
  expect(moved.x).toBeLessThan(box.x - 200);

  await a.reload();
  await audio(a).play();
  await mascot.waitFor();
  await expect.poll(async () => Math.round((await mascot.boundingBox())!.x)).toBe(Math.round(moved.x));

  // Other sites keep the default position. Characters differ in width and sit against the
  // right edge, so compare right edges (another character may be drawn for this page).
  const d = await open('d.test');
  const other = d.getByTestId('happydesk-mascot');
  await expect(other).toHaveAttribute('data-drawn', 'true');
  const ob = (await other.boundingBox())!;
  expect(Math.round(ob.x + ob.width)).toBe(Math.round(box.x + box.width));
});

test('resize handle scales the mascot', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  const mascot = a.getByTestId('happydesk-mascot');
  await expect(mascot).toHaveAttribute('data-drawn', 'true');
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
  await audio(a).play();
  await a.locator('#fs').click();
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(0);
  await a.evaluate(() => document.exitFullscreen());
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(1);
});

test('hide on this site persists', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  await a.getByTestId('happydesk-mascot').hover();
  await a.getByTestId('happydesk-controls').getByLabel('在此站点隐藏').click();
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(0);
  await a.reload();
  await audio(a).play();
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

test('saved layout is clamped into a smaller viewport on load', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  const mascot = a.getByTestId('happydesk-mascot');
  const box = (await mascot.boundingBox())!;
  // Nudge so a layout gets saved near the bottom-right of the 1200×800 window.
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.mouse.down();
  await a.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 4 });
  await a.mouse.up();
  await a.setViewportSize({ width: 500, height: 400 });
  await a.reload();
  await audio(a).play();
  await mascot.waitFor();
  const b = (await mascot.boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(500);
  expect(b.y + b.height).toBeLessThanOrEqual(400);
});

test('keys typed in the control bar do not reach page hotkeys', async ({ open }) => {
  const a = await open('a.test');
  await audio(a).play();
  await a.evaluate(() => {
    (window as unknown as { keys: string[] }).keys = [];
    document.addEventListener('keydown', (e) => (window as unknown as { keys: string[] }).keys.push(e.key));
  });
  await a.getByTestId('happydesk-mascot').hover();
  await a.getByTestId('happydesk-controls').getByLabel('音量').focus();
  await a.keyboard.press('ArrowLeft');
  await a.keyboard.press('Space');
  expect(await a.evaluate(() => (window as unknown as { keys: string[] }).keys)).toEqual([]);
});

test('built-in assets are not reachable by their static extension URL (anti-fingerprinting)', async ({ open, extensionId }) => {
  const a = await open('a.test');
  await audio(a).play();
  await a.getByTestId('happydesk-mascot').waitFor();
  // The overlay itself still renders built-in sprites…
  const bg = await a.evaluate(() => {
    const el = document.querySelector('happydesk-overlay')!.shadowRoot!.querySelector('[data-testid="happydesk-mascot"] .character > div') as HTMLElement;
    return el?.style.backgroundImage ?? '';
  });
  expect(bg).toContain('/packs/');
  expect(bg).not.toContain(extensionId);
  // …but a page can't probe the static id URL.
  const probe = await a.evaluate(async (id) => {
    try {
      const r = await fetch(`chrome-extension://${id}/packs/index.json`);
      return r.ok ? 'reachable' : `status ${r.status}`;
    } catch {
      return 'blocked';
    }
  }, extensionId);
  expect(probe).toBe('blocked');
});
