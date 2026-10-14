// Chrome Web Store promo tile (docs/store/promo-440x280.png), in the landing page's sticker-book look.
// Run: node scripts/gen-promo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..');
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');
const logo = readFileSync(join(ROOT, 'public', 'logo.svg'), 'utf8').replace('<svg ', '<svg width="44" height="44" ');
const font = b64('public/fonts/kobutai-display.woff2');
const char = (id) => `data:image/webp;base64,${b64(`site/assets/chars/${id}.webp`)}`;

const card = (id, bg, tape, rot, x, y) => `
  <div style="position:absolute;left:${x}px;top:${y}px;width:96px;height:150px;background:#fff;border-radius:12px;padding:6px;box-sizing:border-box;transform:rotate(${rot}deg);box-shadow:0 6px 16px rgba(58,39,72,.14)">
    <div style="position:absolute;left:30px;top:-8px;width:36px;height:13px;background:${tape};border-radius:2px"></div>
    <div style="width:100%;height:100%;background:${bg};border-radius:8px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden">
      <img src="${char(id)}" style="height:128px;margin-bottom:4px">
    </div>
  </div>`;

const html = `<html><head><style>
@font-face { font-family: 'KD'; src: url(data:font/woff2;base64,${font}) format('woff2'); }
body { margin: 0; }
</style></head><body>
<div style="position:relative;width:440px;height:280px;overflow:hidden;background-color:#fbe9f1;background-image:radial-gradient(#f1bfd5 1.5px,transparent 1.6px);background-size:22px 22px;color:#3a2748;font-family:system-ui,'PingFang SC','Noto Sans CJK SC',sans-serif">
  <div style="position:absolute;left:28px;top:44px;width:220px">
    <div style="display:flex;align-items:center;gap:10px">${logo}<span style="font-family:KD;font-size:32px;line-height:1">Kobutai</span></div>
    <div style="font-family:KD;font-size:23px;line-height:1.2;margin-top:22px">A tiny stage for whatever you're playing.</div>
    <div style="font-size:13px;color:#6e5a7c;margin-top:14px">听什么，就抽谁出来陪你</div>
  </div>
  ${card('rina', '#ffd3e5', 'rgba(255,226,122,.9)', -6, 252, 40)}
  ${card('hoshiri', '#cdebfa', 'rgba(255,141,187,.85)', 5, 330, 92)}
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 280 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
writeFileSync(join(ROOT, 'docs', 'store', 'promo-440x280.png'), await page.screenshot({ clip: { x: 0, y: 0, width: 440, height: 280 } }));
await browser.close();
console.log('promo written');
