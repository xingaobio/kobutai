import { t } from '../i18n/core';
import type { Genre, LoadedPack, PackManifest, StateAsset, StateName } from '../pack/types';
import { safeSlug } from '../petdex';
import { zip } from './zip';

/**
 * Sharing a character the user drew with everyone: the extension packs it in the
 * library format, then the user sends the file through GitHub or email. There is
 * no Kobutai server; the maintainer reviews submissions and adds accepted ones to
 * `library/`, which every install syncs (see docs/COMMUNITY-CHARACTERS.md).
 */
export const SUBMIT_REPO = 'xingaobio/kobutai';
/** Where emailed submissions go. Leave empty to offer GitHub only. */
export const SUBMIT_EMAIL = '';
export const SHARE_LICENSE = 'CC BY 4.0';
export const SHARE_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

export interface ShareForm {
  name: string;
  author: string;
  /** Empty = generic pool (any content). */
  genres: Genre[];
}

/** Only characters from the user's own files can be shared; Petdex ones belong to their submitters. */
export const canShare = (p: Pick<LoadedPack, 'source'>) => p.source === 'user';

export function sheetFileName(sheet: Blob): string {
  return sheet.type === 'image/png' ? 'sheet.png' : 'sheet.webp';
}

/** The pack.json that goes into `library/<id>/`. */
export function sharedManifest(pack: PackManifest, form: ShareForm, sheetFile: string): PackManifest {
  const id = safeSlug(form.name.trim() || pack.name);
  const states = {} as Record<StateName, StateAsset>;
  for (const [k, a] of Object.entries(pack.states) as [StateName, StateAsset][]) states[k] = { ...a, src: sheetFile };
  return {
    id,
    name: form.name.trim() || pack.name,
    author: form.author.trim(),
    license: SHARE_LICENSE,
    tags: { type: [], genre: [...form.genres] },
    size: { ...pack.size },
    states: states as PackManifest['states'],
  };
}

export function credits(m: PackManifest, at: Date): string {
  return [
    `${m.name} — by ${m.author}`,
    `License: ${SHARE_LICENSE} (${SHARE_LICENSE_URL})`,
    '',
    `Submitted to Kobutai on ${at.toISOString().slice(0, 10)}.`,
    'The author confirmed that they made this character, or have the right to share it,',
    `and agreed to release it under ${SHARE_LICENSE}: anyone may use and adapt it with credit to the author.`,
    '',
  ].join('\n');
}

export async function buildSubmission(
  pack: PackManifest,
  form: ShareForm,
  sheet: Blob,
  at = new Date(),
): Promise<{ blob: Blob; filename: string; manifest: PackManifest }> {
  const file = sheetFileName(sheet);
  const manifest = sharedManifest(pack, form, file);
  const enc = new TextEncoder();
  const dir = manifest.id;
  const bytes = zip(
    [
      { name: `${dir}/pack.json`, data: enc.encode(JSON.stringify(manifest, null, 2) + '\n') },
      { name: `${dir}/${file}`, data: new Uint8Array(await sheet.arrayBuffer()) },
      { name: `${dir}/CREDITS.txt`, data: enc.encode(credits(manifest, at)) },
    ],
    at,
  );
  return { blob: new Blob([bytes as BlobPart], { type: 'application/zip' }), filename: `kobutai-${dir}.zip`, manifest };
}

const genreList = (m: PackManifest) => m.tags.genre.join(', ') || 'any';

/** A new GitHub issue with the form pre-filled; the user drags the zip in. */
export function githubIssueUrl(m: PackManifest, filename: string): string {
  const u = new URL(`https://github.com/${SUBMIT_REPO}/issues/new`);
  u.searchParams.set('template', 'character.yml');
  u.searchParams.set('title', `[Character] ${m.name}`);
  u.searchParams.set('name', m.name);
  u.searchParams.set('author', m.author ?? '');
  u.searchParams.set('genres', genreList(m));
  u.searchParams.set('file', filename);
  return u.href;
}

export function mailtoUrl(m: PackManifest, filename: string): string | null {
  if (!SUBMIT_EMAIL) return null;
  const body = [
    t('share.mail.intro'),
    '',
    `${t('share.mail.name')}: ${m.name}`,
    `${t('share.mail.author')}: ${m.author}`,
    `${t('share.mail.genres')}: ${genreList(m)}`,
    `${t('share.mail.license')}: ${SHARE_LICENSE} — ${t('share.mail.consent')}`,
    '',
    t('share.mail.attach', { file: filename }),
  ].join('\n');
  return `mailto:${SUBMIT_EMAIL}?subject=${encodeURIComponent(`[Kobutai] ${m.name}`)}&body=${encodeURIComponent(body)}`;
}
