// Rasterised assets: the remote character library (library/, PNG sheets) and the
// extension icons (public/icon/*.png). Uses Playwright's Chromium to render SVG.
// Run: node scripts/gen-raster.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { FRAMES, H, ROWS, W, frame, packJson, sheet } from './mascot.mjs';

const ROOT = join(import.meta.dirname, '..');

const LIBRARY = [
  { id: 'dj-neko', name: 'DJ Neko', body: '#7cf5d2', accent: '#ff4fd8', prop: 'headphones', tags: { type: ['music'], genre: ['electronic', 'hiphop'] } },
  { id: 'idol-star', name: '偶像 Star', body: '#ffd166', accent: '#ef476f', prop: 'mic', tags: { type: ['music'], genre: ['anime', 'jpop'] } },
];

async function render(page, svg, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

const browser = await chromium.launch();
const page = await browser.newPage();

const libDir = join(ROOT, 'library');
for (const c of LIBRARY) {
  const dir = join(libDir, c.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sheet.png'), await render(page, sheet(c), W * FRAMES, H * ROWS.length));
  writeFileSync(join(dir, 'pack.json'), JSON.stringify(packJson(c, 'sheet.png'), null, 2) + '\n');
}
writeFileSync(join(libDir, 'index.json'), JSON.stringify({ packs: LIBRARY.map((c) => c.id) }, null, 2) + '\n');

// Icon: the Kobutai sticker mark (public/logo.svg).
const logoSvg = readFileSync(join(ROOT, 'public', 'logo.svg'), 'utf8');
const iconSvg = (size) => logoSvg.replace('<svg ', `<svg width="${size}" height="${size}" `);
const iconDir = join(ROOT, 'public', 'icon');
mkdirSync(iconDir, { recursive: true });
for (const size of [16, 32, 48, 96, 128]) writeFileSync(join(iconDir, `${size}.png`), await render(page, iconSvg(size), size, size));
writeFileSync(join(ROOT, 'site', 'assets', 'favicon-32.png'), await render(page, iconSvg(32), 32, 32));
writeFileSync(join(ROOT, 'site', 'assets', 'icon-128.png'), await render(page, iconSvg(128), 128, 128));
// Store promo tile: scripts/gen-promo.mjs.
await browser.close();
console.log('library + icons written');
