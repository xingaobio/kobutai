import type { Page } from '@playwright/test';
import { TONE_URL, audio, expect, songPage, test } from './fixtures';

// Hits the real petdex.dev; run with PETDEX_LIVE=1.
test.skip(!process.env.PETDEX_LIVE, 'set PETDEX_LIVE=1 to run against petdex.dev');

const mascot = (p: Page) => p.getByTestId('happydesk-mascot');
const MIKU = /^petdex-(hatsune-miku-2|hatsune-miku|miku|miku-metalhead)$/;

test('auto match: off by default; when on, a title that names a character shows that character', async ({
  context,
  extensionId,
  open,
}) => {
  test.setTimeout(120_000);

  // Off (the default): the usual pool draw, nothing downloaded.
  const before = await open('a.test', songPage('【初音ミク】千本桜【MMD】', 'MMD制作组'));
  await audio(before).play();
  await expect(mascot(before)).toHaveAttribute('data-pack', /^(?!petdex-).+/);
  await audio(before).pause();

  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#import`);
  await expect(opts.getByTestId('auto-match')).not.toBeChecked();
  await opts.getByTestId('auto-match').check();

  // On: new content naming Miku downloads one Miku from Petdex. A slow first download
  // falls back to the pool for that one song, so wait for the character to be installed…
  const first = await open('b.test', songPage('【初音ミク】ワールドイズマイン', 'ryo'));
  await audio(first).play();
  await opts.getByRole('tab', { name: '导入角色' }).click();
  const imported = opts.locator('[data-testid="imported-pack"]');
  await expect(imported).toHaveCount(1, { timeout: 60_000 });
  const id = (await imported.getAttribute('data-pack'))!;
  expect(id).toMatch(MIKU);
  await audio(first).pause();

  // …then any further Miku title shows it at once, with no second download.
  const again = await open('c.test', songPage('初音未来 - 甩葱歌', 'someone'));
  await audio(again).play();
  await expect(mascot(again)).toHaveAttribute('data-pack', id);
  await expect(imported).toHaveCount(1);
  await expect
    .poll(
      () =>
        again.evaluate(() => {
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
  await again.screenshot({ path: 'test-results/match-live.png' });

  // Content that names nothing still gets a pool draw.
  await audio(again).pause();
  const other = await open('d.test', songPage('Deep House Mix 2024 | Best of Vocal House', 'Mr. Mix'));
  await audio(other).play();
  await expect(mascot(other)).toHaveAttribute('data-pack', /^.+$/);
  await expect(imported).toHaveCount(1);
});

const enable = async (context: import('@playwright/test').BrowserContext, extensionId: string) => {
  const opts = await context.newPage();
  await opts.goto(`chrome-extension://${extensionId}/options.html#import`);
  await opts.getByTestId('auto-match').check();
  return opts;
};

test('auto match: 换一次 on a matched character gives another character of the same match', async ({ context, extensionId, open }) => {
  test.setTimeout(90_000);
  await enable(context, extensionId);
  const p = await open('a.test', songPage('【初音ミク】千本桜【MMD】', 'x'));
  await audio(p).play();
  await expect(mascot(p)).toHaveAttribute('data-pack', /^petdex-/, { timeout: 30_000 });
  const before = await mascot(p).getAttribute('data-pack');
  await mascot(p).hover();
  await p.getByTestId('happydesk-reroll').click();
  await expect(mascot(p)).not.toHaveAttribute('data-pack', before!, { timeout: 30_000 });
  const after = await mascot(p).getAttribute('data-pack');
  expect(after).toMatch(/^petdex-(hatsune-miku-2|hatsune-miku|miku|miku-metalhead)$/);
  // The emoji bubble celebrates the reroll.
  await expect(p.getByTestId('happydesk-bubble')).toHaveAttribute('data-emoji', 'party-face');
});

test('auto match: a music player switching tracks gets the right character for every track', async ({ context, extensionId, open }) => {
  test.setTimeout(150_000);
  await enable(context, extensionId);
  // One page, one <audio>, tracks changed through Media Session like YouTube Music / Spotify / Apple Music web.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Player</title></head><body>
    <audio id="media" src="${TONE_URL}" loop preload="auto"></audio>
    <script>window.setTrack=(t,a)=>{document.title=t+' - Player';navigator.mediaSession.metadata=new MediaMetadata({title:t,artist:a});};setTrack('Intro','DJ');</script></body></html>`;
  const p = await open('music.test', html);
  await audio(p).play();
  const tracks: [string, string, RegExp][] = [
    ['アイドル', 'YOASOBI', /^petdex-(ai-hoshino|ruby)$/],
    ['Numb', 'Linkin Park', /^(?!petdex-)/],
    ['奶龙之歌', '奶龙', /^petdex-(nailong|nailong-6|nai-long-2|nai-long|nailong-2)$/],
    ['Lose Yourself', 'Eminem', /^petdex-eminem-brisk$/],
    ['晴天', '周杰伦', /^petdex-jay-chou-q$/],
  ];
  for (const [t, a, want] of tracks) {
    const t0 = Date.now();
    await p.evaluate(([t, a]) => (window as any).setTrack(t, a), [t, a]);
    await expect.poll(() => mascot(p).getAttribute('data-pack'), { timeout: 20_000 }).toMatch(want);
    await p.waitForTimeout(1500);
  }
  // Rapid skipping: three tracks inside a second; the last one must win, not a stale one.
  const t0 = Date.now();
  for (const [t, a] of [['Chainsaw Man - KICK BACK', '米津玄師'], ['Numb', 'Linkin Park'], ['千本桜 feat. 初音ミク', '黒うさP']]) {
    await p.evaluate(([t, a]) => (window as any).setTrack(t, a), [t, a]);
    await p.waitForTimeout(300);
  }
  await expect.poll(() => mascot(p).getAttribute('data-pack'), { timeout: 30_000 }).toMatch(/^petdex-(hatsune-miku-2|hatsune-miku|miku|miku-metalhead)$/);
  await p.waitForTimeout(4000);
  await expect(mascot(p)).toHaveAttribute('data-pack', /^petdex-(hatsune-miku-2|hatsune-miku|miku|miku-metalhead)$/);
});
