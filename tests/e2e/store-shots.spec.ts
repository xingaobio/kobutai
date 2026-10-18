import type { Page } from '@playwright/test';
import { audio, songPage, test } from './fixtures';

// Generates Chrome Web Store screenshots (1280×800) in English and Chinese:
//   STORE_SHOTS=1 npx playwright test store-shots
// Output: docs/marketing/store/<lang>/1-stage.png … 4-ai.png
test.skip(!process.env.STORE_SHOTS, 'set STORE_SHOTS=1 to regenerate store screenshots');
test.setTimeout(180_000);

const OUT = 'docs/marketing/store';
const W = { width: 1280, height: 800 };

/** A full-window "player" page so the screenshot reads like a real site. */
const playerPage = (title: string, artist: string, bg: string) =>
  songPage(title, artist).replace(
    '<body>',
    `<body style="margin:0;height:100vh;background:${bg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box">
      <div style="font-size:15px;letter-spacing:.12em;text-transform:uppercase;opacity:.6;margin-bottom:14px">Now playing</div>
      <div style="font-size:46px;font-weight:800;max-width:720px;line-height:1.15">${title}</div>
      <div style="font-size:22px;opacity:.75;margin-top:14px">${artist}</div>`,
  );

/** Songs from different pools, so the album has several characters. */
const WARMUP: [string, string, string][] = [
  ['lofi.test', 'lofi hip hop radio – beats to relax/study to', 'Lofi Girl'],
  ['rock.test', 'Linkin Park – Numb (Official Music Video)', 'Linkin Park'],
  ['cpop.test', '周杰伦《晴天》MV', '周杰伦'],
  ['anime.test', '【初音ミク】千本桜【オリジナル】', '黒うさP'],
  ['talk.test', 'How Transformers Work – A Visual Guide', '3Blue1Brown'],
];

async function play(open: (h: string, html?: string) => Promise<Page>, host: string, title: string, artist: string, bg: string) {
  const p = await open(host, playerPage(title, artist, bg));
  await p.setViewportSize(W);
  await audio(p).play();
  await p.getByTestId('happydesk-mascot').waitFor();
  await p.waitForTimeout(1800);
  return p;
}

for (const lang of ['en', 'zh'] as const) {
  test(`store screenshots (${lang})`, async ({ open, context, extensionId }) => {
    // Only the 12 built-in characters: leave the sample packs of the remote library out of the pictures.
    await context.route(/raw\.githubusercontent\.com/, (r) => r.abort());
    const opts = await context.newPage();
    await opts.setViewportSize(W);
    await opts.goto(`chrome-extension://${extensionId}/options.html#collection`);
    await opts.locator(`[data-testid="lang-switch"] [data-lang="${lang}"]`).click();

    for (const [host, title, artist] of WARMUP) {
      const p = await play(open, host, title, artist, '#222');
      await audio(p).pause();
      await p.close();
    }

    // 1. The character on a page that's playing music.
    const a = await play(open, 'music.test', 'YOASOBI「アイドル」 Official Music Video', 'YOASOBI', 'linear-gradient(135deg,#4a1d4f,#1b1b2f)');
    await a.screenshot({ path: `${OUT}/${lang}/1-stage.png` });
    // 2. Hover: the control bar.
    await a.getByTestId('happydesk-mascot').hover();
    await a.waitForTimeout(700);
    await a.screenshot({ path: `${OUT}/${lang}/2-controls.png` });
    await audio(a).pause();

    // 3. The album.
    await opts.goto(`chrome-extension://${extensionId}/options.html#collection`);
    await opts.waitForTimeout(1200);
    await opts.screenshot({ path: `${OUT}/${lang}/3-album.png` });

    // 4. AI page: the built-in model and the optional second opinion.
    await opts.goto(`chrome-extension://${extensionId}/options.html#models`);
    await opts.waitForTimeout(1000);
    await opts.screenshot({ path: `${OUT}/${lang}/4-ai.png` });
  });
}
