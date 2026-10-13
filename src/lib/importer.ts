import { blobRef, deleteBlob, putBlob } from './blobstore';
import { t } from './i18n/core';
import type { LoadedPack } from './pack/types';
import { PETDEX_MANIFEST_URL, countFrames, parseManifest, safeSlug, toPack, type PetdexEntry } from './petdex';
import { collection, lockedPack, removedPacks, userPacks } from './settings';

/** Decode a sheet, measure frames per row, store the blob and register the pack. */
export async function importSheet(
  sheet: Blob,
  meta: { slug: string; displayName: string; submittedBy?: string },
  /** From the user's own files rather than the Petdex site. */
  local = false,
): Promise<LoadedPack> {
  const bmp = await createImageBitmap(sheet);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bmp, 0, 0);
  const frames = countFrames(ctx.getImageData(0, 0, bmp.width, bmp.height)); // throws if not a Petdex grid
  bmp.close();

  const key = `petdex-${safeSlug(meta.slug)}`;
  await putBlob(key, sheet);
  const pet = toPack(meta, blobRef(key), frames);
  const pack: LoadedPack = local ? { ...pet, source: 'user', author: undefined, license: '你自己导入的角色' } : pet;
  const others = (await userPacks.getValue()).filter((p) => p.id !== pack.id);
  await userPacks.setValue([...others, pack]);
  return pack;
}

export async function fetchPetdexManifest(): Promise<PetdexEntry[]> {
  const res = await fetch(PETDEX_MANIFEST_URL);
  if (!res.ok) throw new Error(t('err.petdexList', { status: res.status }));
  return parseManifest(await res.json());
}

export async function importFromPetdex(
  entry: Pick<PetdexEntry, 'slug' | 'displayName' | 'submittedBy' | 'spritesheetUrl'>,
  opts: { maxBytes?: number } = {},
): Promise<LoadedPack> {
  const res = await fetch(entry.spritesheetUrl);
  if (!res.ok) throw new Error(t('err.sheetDownload', { status: res.status }));
  const sheet = await res.blob();
  // Downloads nobody clicked for (lib/match) get a size limit before the image is decoded.
  if (opts.maxBytes && sheet.size > opts.maxBytes) throw new Error(t('err.sheetTooBig', { kb: Math.round(sheet.size / 1024) }));
  return importSheet(sheet, entry);
}

/** Local import of a Petdex/Codex pet folder: pet.json + spritesheet.(webp|png). */
export async function importFromFiles(files: FileList | File[]): Promise<LoadedPack> {
  const list = [...files];
  const json = list.find((f) => f.name.toLowerCase() === 'pet.json');
  const sheet = list.find((f) => /^spritesheet\.(webp|png)$/i.test(f.name)) ?? list.find((f) => /\.(webp|png)$/i.test(f.name));
  if (!sheet) throw new Error(t('err.noSheet'));
  let meta = { slug: sheet.name.replace(/\.[^.]+$/, ''), displayName: sheet.name.replace(/\.[^.]+$/, '') };
  if (json) {
    const pet = JSON.parse(await json.text()) as { id?: unknown; displayName?: unknown };
    const id = typeof pet.id === 'string' ? pet.id : meta.slug;
    meta = { slug: id, displayName: typeof pet.displayName === 'string' ? pet.displayName : id };
  }
  return importSheet(sheet, meta, true);
}

export async function removeUserPack(id: string): Promise<void> {
  await userPacks.setValue((await userPacks.getValue()).filter((p) => p.id !== id));
  if ((await lockedPack.getValue()) === id) await lockedPack.setValue(null);
  const { [id]: _removed, ...rest } = await collection.getValue();
  await collection.setValue(rest);
  await deleteBlob(id).catch(() => {});
}

/**
 * Delete a character from the 图鉴. An imported one is erased (pack, sheet and its
 * 图鉴 record). A built-in or library one can't be erased, so it is taken out of the
 * catalog (never drawn or shown again) until {@link restorePacks} brings it back.
 */
export async function removeFromCollection(pack: Pick<LoadedPack, 'id' | 'source'>): Promise<void> {
  if (pack.source === 'petdex' || pack.source === 'user') return removeUserPack(pack.id);
  if ((await lockedPack.getValue()) === pack.id) await lockedPack.setValue(null);
  await removedPacks.setValue([...new Set([...(await removedPacks.getValue()), pack.id])]);
}

/** Bring deleted built-in / library characters back (all of them when no ids are given). */
export async function restorePacks(ids?: readonly string[]): Promise<void> {
  const back = ids && new Set(ids);
  await removedPacks.setValue(back ? (await removedPacks.getValue()).filter((id) => !back.has(id)) : []);
}
