import { audio, expect, test } from './fixtures';

type PipWin = { documentPictureInPicture?: { window: Window | null } };

test('pop out into a Document Picture-in-Picture window and back', async ({ open }) => {
  const a = await open('https://pip.test');
  await audio(a).play();
  const supported = await a.evaluate(() => 'documentPictureInPicture' in window);
  await a.getByTestId('happydesk-mascot').hover();
  const btn = a.getByTestId('happydesk-pip-open');
  if (!supported) {
    // Graceful degradation: no button where the API is missing.
    await expect(btn).toHaveCount(0);
    test.skip(true, 'Document PiP not available in this browser build');
    return;
  }
  await btn.click();

  // The page overlay steps aside…
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(0);
  // …and the PiP window shows the mascot and controls.
  const pipState = () =>
    a.evaluate(() => {
      const w = (window as unknown as PipWin).documentPictureInPicture?.window;
      const d = w?.document;
      return {
        open: !!w,
        mood: d?.querySelector('[data-testid="happydesk-mascot"]')?.getAttribute('data-mood') ?? null,
        controls: !!d?.querySelector('[data-testid="happydesk-controls"]'),
        styled: d ? getComputedStyle(d.querySelector('[data-testid="happydesk-controls"]')!).borderRadius : null,
      };
    });
  await expect.poll(pipState).toMatchObject({ open: true, mood: 'playing', controls: true, styled: '14px' });

  // Controls inside the PiP window drive the media.
  await a.evaluate(() => {
    const d = (window as unknown as PipWin).documentPictureInPicture!.window!.document;
    (d.querySelector('[data-testid="happydesk-toggle"]') as HTMLButtonElement).click();
  });
  await expect.poll(async () => (await audio(a).state()).paused).toBe(true);
  await expect.poll(async () => (await pipState()).mood).toBe('paused');

  // Closing the PiP window brings the overlay back.
  await a.evaluate(() => (window as unknown as PipWin).documentPictureInPicture!.window!.close());
  await expect(a.getByTestId('happydesk-mascot')).toHaveCount(1);
});

test('no PiP button where the API is unavailable (insecure page)', async ({ open }) => {
  const a = await open('plain.test');
  await audio(a).play();
  await a.getByTestId('happydesk-mascot').hover();
  await expect(a.getByTestId('happydesk-controls')).toBeVisible();
  await expect(a.getByTestId('happydesk-pip-open')).toHaveCount(0);
});
