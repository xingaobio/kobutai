// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { PETDEX_MANIFEST_URL, parseManifest } from '../petdex';
import { MATCH_RULES } from './table';

// Checks every slug in the match table against the real Petdex manifest.
// Run with `npm run match:check`. Set PETDEX_MANIFEST_FILE to check a downloaded copy instead.
test.skipIf(!process.env.MATCH_LIVE)('every character in the match table exists on Petdex', async () => {
  const file = process.env.PETDEX_MANIFEST_FILE;
  const json: unknown = file
    ? JSON.parse(readFileSync(file, 'utf8'))
    : await fetch(PETDEX_MANIFEST_URL).then((r) => {
        if (!r.ok) throw new Error(`Petdex manifest: HTTP ${r.status}`);
        return r.json();
      });
  const pets = new Map(parseManifest(json).map((p) => [p.slug, p]));
  const missing = MATCH_RULES.flatMap((r) => r.petdex.filter((s) => !pets.has(s)).map((s) => `${r.id}: ${s}`));
  const empty = MATCH_RULES.filter((r) => r.petdex.every((s) => !pets.has(s))).map((r) => r.id);
  console.info(
    `${MATCH_RULES.length} rules, ${new Set(MATCH_RULES.flatMap((r) => r.petdex)).size} characters, ${pets.size} pets on Petdex` +
      (missing.length ? `\nmissing:\n  ${missing.join('\n  ')}` : ''),
  );
  // A rule with no character left can never fire; single missing slugs are worth fixing too.
  expect(empty).toEqual([]);
  expect(missing).toEqual([]);
}, 60_000);
