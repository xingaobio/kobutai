#!/usr/bin/env node
/**
 * Add a shared character to the library that every Kobutai install syncs.
 *
 *   node scripts/add-character.mjs ~/Downloads/kobutai-blobby.zip [--genres lofi,jpop] [--id new-id]
 *
 * Unpacks the zip the extension made (pack.json + sheet + CREDITS.txt), checks it,
 * copies it to library/<id>/, adds it to library/index.json and library/CREDITS.md.
 * Commit and push, and installs pick it up within 12 hours.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(root, 'library');
const GENRES = ['jpop', 'anime', 'western-pop', 'hiphop', 'rock', 'electronic', 'classical', 'lofi', 'cpop', 'other'];
const MAX_SHEET = 4 * 1024 * 1024;

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const genresArg = opt('genres');
const idArg = opt('id');
const input = args[0];
if (!input) {
  console.error('usage: node scripts/add-character.mjs <kobutai-….zip | folder> [--genres a,b] [--id new-id]');
  process.exit(1);
}
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// 1. Unpack (or use a folder as-is).
let dir = path.resolve(input);
let cleanup = () => {};
if (statSync(dir).isFile()) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'kobutai-'));
  execFileSync('unzip', ['-q', dir, '-d', tmp]);
  cleanup = () => rmSync(tmp, { recursive: true, force: true });
  const inner = readdirSync(tmp).filter((n) => !n.startsWith('.') && n !== '__MACOSX');
  dir = inner.length === 1 && statSync(path.join(tmp, inner[0])).isDirectory() ? path.join(tmp, inner[0]) : tmp;
}

try {
  // 2. Check it.
  const packPath = path.join(dir, 'pack.json');
  if (!existsSync(packPath)) fail('no pack.json in the submission');
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  if (idArg) pack.id = idArg;
  if (genresArg) pack.tags.genre = genresArg === 'any' ? [] : genresArg.split(',').map((g) => g.trim());
  if (!/^[a-z0-9][a-z0-9-_]{0,49}$/.test(pack.id ?? '')) fail(`bad id "${pack.id}" (use --id)`);
  if (!pack.name?.trim()) fail('missing name');
  if (!pack.author?.trim()) fail('missing author: shared characters must be credited');
  if (pack.license !== 'CC BY 4.0') fail(`license is "${pack.license}", expected "CC BY 4.0"`);
  for (const g of pack.tags?.genre ?? []) if (!GENRES.includes(g)) fail(`unknown genre "${g}"`);
  const files = new Set(Object.values(pack.states ?? {}).map((s) => s.src));
  if (!pack.states?.idle) fail('missing states.idle');
  for (const f of files) {
    if (f.includes('/') || f.includes('..')) fail(`asset path "${f}" must be a plain file name`);
    if (!existsSync(path.join(dir, f))) fail(`missing asset ${f}`);
    if (statSync(path.join(dir, f)).size > MAX_SHEET) fail(`${f} is larger than 4 MB`);
  }

  // 3. Copy into library/<id>/ and register.
  const index = JSON.parse(readFileSync(path.join(LIB, 'index.json'), 'utf8'));
  const dest = path.join(LIB, pack.id);
  if (existsSync(dest) || index.packs.includes(pack.id)) fail(`library/${pack.id} already exists (use --id)`);
  mkdirSync(dest);
  for (const f of [...files, ...(existsSync(path.join(dir, 'CREDITS.txt')) ? ['CREDITS.txt'] : [])]) copyFileSync(path.join(dir, f), path.join(dest, f));
  writeFileSync(path.join(dest, 'pack.json'), JSON.stringify(pack, null, 2) + '\n');
  index.packs.push(pack.id);
  writeFileSync(path.join(LIB, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  const creditsPath = path.join(LIB, 'CREDITS.md');
  const head = '# Community characters\n\nShared by their authors under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).\n\n| Character | Author | Added |\n|---|---|---|\n';
  const credits = existsSync(creditsPath) ? readFileSync(creditsPath, 'utf8') : head;
  writeFileSync(creditsPath, credits + `| ${pack.name} (\`${pack.id}\`) | ${pack.author} | ${new Date().toISOString().slice(0, 10)} |\n`);

  console.log(`✓ Added ${pack.name} by ${pack.author} as library/${pack.id} (${pack.tags.genre.join(', ') || 'any genre'}).`);
  console.log('  Commit and push: every install picks it up on its next sync (within 12 hours).');
} finally {
  cleanup();
}
