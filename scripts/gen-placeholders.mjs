// Generates the built-in placeholder mascots into public/packs/.
// Each pack is one SVG sprite sheet (8 frames x 5 state rows) plus pack.json.
// Run: node scripts/gen-placeholders.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packJson, sheet } from './mascot.mjs';

const CHARACTERS = [
  { id: 'momo', name: 'Momo 歌姬', body: '#ff8fc7', accent: '#5ee6d6', prop: 'mic', tags: { type: ['music'], genre: ['jpop', 'anime', 'cpop'] } },
  { id: 'rocky', name: 'Rocky', body: '#ff9d4d', accent: '#3a3a3a', prop: 'guitar', tags: { type: ['music'], genre: ['rock', 'western-pop', 'hiphop'] } },
  { id: 'nyan-lofi', name: 'Lo-fi 猫', body: '#9db4ff', accent: '#ffd36e', prop: 'headphones', tags: { type: ['music'], genre: ['lofi', 'classical', 'electronic'] } },
  { id: 'prof-blob', name: '讲解员 Blob', body: '#8fe08a', accent: '#2f5d8a', prop: 'glasses', tags: { type: ['video', 'podcast', 'live'], genre: [] } },
  { id: 'pixel', name: 'Pixel', body: '#c9a7ff', accent: '#ffffff', prop: 'none', tags: { type: [], genre: [] } },
];

const root = join(import.meta.dirname, '..', 'public', 'packs');
for (const c of CHARACTERS) {
  const dir = join(root, c.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sheet.svg'), sheet(c));
  writeFileSync(join(dir, 'pack.json'), JSON.stringify(packJson(c, 'sheet.svg'), null, 2) + '\n');
}
writeFileSync(join(root, 'index.json'), JSON.stringify({ packs: CHARACTERS.map((c) => c.id) }, null, 2) + '\n');
console.log(`generated ${CHARACTERS.length} packs in ${root}`);
