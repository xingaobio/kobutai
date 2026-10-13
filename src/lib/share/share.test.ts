import { describe, expect, it } from 'vitest';
import { validatePack } from '../pack/validate';
import { toPack } from '../petdex';
import { buildSubmission, githubIssueUrl, sharedManifest, SUBMIT_REPO } from './submit';
import { crc32, unzip, zip } from './zip';

const pet = { ...toPack({ slug: 'my-cat', displayName: 'My Cat' }, 'hdblob:petdex-my-cat', [6, 8, 8, 4, 5, 8, 6, 6, 6]), source: 'user' as const };

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips entries with UTF-8 names', () => {
    const files = [
      { name: 'a/pack.json', data: new TextEncoder().encode('{"x":1}') },
      { name: 'a/猫.webp', data: new Uint8Array([1, 2, 3, 250]) },
    ];
    const out = unzip(zip(files));
    expect(out.map((f) => f.name)).toEqual(['a/pack.json', 'a/猫.webp']);
    expect([...out[1]!.data]).toEqual([1, 2, 3, 250]);
  });
});

describe('sharing a character', () => {
  it('writes a valid library pack credited to the author under CC BY 4.0', () => {
    const m = sharedManifest(pet, { name: 'Mochi Cat', author: 'Mika', genres: ['lofi'] }, 'sheet.webp');
    expect(m).toMatchObject({ id: 'mochi-cat', name: 'Mochi Cat', author: 'Mika', license: 'CC BY 4.0', tags: { type: [], genre: ['lofi'] } });
    expect(Object.values(m.states).every((s) => s.src === 'sheet.webp')).toBe(true);
    expect(validatePack(m).ok).toBe(true);
    expect(JSON.stringify(m)).not.toContain('hdblob');
    expect('source' in m).toBe(false);
  });

  it('packs pack.json, the sheet and the credits into one zip folder', async () => {
    const sheet = new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'image/webp' });
    const r = await buildSubmission(pet, { name: 'Mochi Cat', author: 'Mika', genres: [] }, sheet, new Date('2026-10-11T12:00:00Z'));
    expect(r.filename).toBe('kobutai-mochi-cat.zip');
    const files = unzip(new Uint8Array(await r.blob.arrayBuffer()));
    expect(files.map((f) => f.name)).toEqual(['mochi-cat/pack.json', 'mochi-cat/sheet.webp', 'mochi-cat/CREDITS.txt']);
    const credits = new TextDecoder().decode(files[2]!.data);
    expect(credits).toContain('Mochi Cat — by Mika');
    expect(credits).toContain('CC BY 4.0');
    expect(credits).toContain('2026-10-11');
  });

  it('opens a pre-filled GitHub issue', () => {
    const m = sharedManifest(pet, { name: 'Mochi Cat', author: 'Mika', genres: ['lofi', 'jpop'] }, 'sheet.webp');
    const u = new URL(githubIssueUrl(m, 'kobutai-mochi-cat.zip'));
    expect(u.pathname).toBe(`/${SUBMIT_REPO}/issues/new`);
    expect(u.searchParams.get('template')).toBe('character.yml');
    expect(u.searchParams.get('author')).toBe('Mika');
    expect(u.searchParams.get('genres')).toBe('lofi, jpop');
  });
});
