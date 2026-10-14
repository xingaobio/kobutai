import { audio, songPage, test } from './fixtures';

// Generates Chrome Web Store screenshots (1280×800). Run: STORE_SHOTS=1 npx playwright test store-shots
test.skip(!process.env.STORE_SHOTS, 'set STORE_SHOTS=1 to regenerate store screenshots');
test.use({});

const page = (title: string, sub: string, color: string) =>
  songPage(title, sub).replace(
    '<body>',
    `<body style="margin:0;height:100vh;background:${color};font-family:system-ui;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box">
      <div style="font-size:44px;font-weight:800;max-width:760px">${title}</div><div style="font-size:22px;opacity:.75;margin-top:12px">${sub}</div>`,
  );

test('store screenshots', async ({ open, context, extensionId }) => {
  const a = await open('music.test', page('YOASOBI「アイドル」 Official Music Video', 'YOASOBI', 'linear-gradient(135deg,#3b1d4a,#1b1b2f)'));
  await a.setViewportSize({ width: 1280, height: 800 });
  await audio(a).play();
  await a.reload();
  await audio(a).play();
  await a.waitForTimeout(1500);
  await a.screenshot({ path: 'docs/marketing/store/screenshot-1-mascot.png' });
  await a.getByTestId('happydesk-mascot').hover();
  await a.waitForTimeout(600);
  await a.screenshot({ path: 'docs/marketing/store/screenshot-2-controls.png' });

  const c = await context.newPage();
  await c.setViewportSize({ width: 1280, height: 800 });
  await c.goto(`chrome-extension://${extensionId}/options.html#collection`);
  await c.waitForTimeout(800);
  await c.screenshot({ path: 'docs/marketing/store/screenshot-3-collection.png' });
});
