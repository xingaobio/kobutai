import { blobRef, deleteBlob, putBlob } from './blobstore';
import type { LoadedPack } from './pack/types';
import { PETDEX_MANIFEST_URL, countFrames, parseManifest, safeSlug, toPack, type PetdexEntry } from './petdex';
import { collection, lockedPack, userPacks } from './settings';

/** Decode a sheet, measure frames per row, store the blob and register the pack. */
export async function importSheet(
  sheet: Blob,
  meta: { slug: string; displayName: string; submittedBy?: string },
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
  const pack = toPack(meta, blobRef(key), frames);
  const others = (await userPacks.getValue()).filter((p) => p.id !== pack.id);
  await userPacks.setValue([...others, pack]);
  return pack;
}

export async function fetchPetdexManifest(): Promise<PetdexEntry[]> {
  const res = await fetch(PETDEX_MANIFEST_URL);
  if (!res.ok) throw new Error(`Petdex 清单下载失败：HTTP ${res.status}`);
  return parseManifest(await res.json());
}

export async function importFromPetdex(entry: PetdexEntry): Promise<LoadedPack> {
  const res = await fetch(entry.spritesheetUrl);
  if (!res.ok) throw new Error(`精灵图下载失败：HTTP ${res.status}`);
  return importSheet(await res.blob(), entry);
}

/** Local import of a Petdex/Codex pet folder: pet.json + spritesheet.(webp|png). */
export async function importFromFiles(files: FileList | File[]): Promise<LoadedPack> {
  const list = [...files];
  const json = list.find((f) => f.name.toLowerCase() === 'pet.json');
  const sheet = list.find((f) => /^spritesheet\.(webp|png)$/i.test(f.name)) ?? list.find((f) => /\.(webp|png)$/i.test(f.name));
  if (!sheet) throw new Error('没有找到 spritesheet.webp / .png');
  let meta = { slug: sheet.name.replace(/\.[^.]+$/, ''), displayName: sheet.name.replace(/\.[^.]+$/, '') };
  if (json) {
    const pet = JSON.parse(await json.text()) as { id?: unknown; displayName?: unknown };
    const id = typeof pet.id === 'string' ? pet.id : meta.slug;
    meta = { slug: id, displayName: typeof pet.displayName === 'string' ? pet.displayName : id };
  }
  return importSheet(sheet, meta);
}

export async function removeUserPack(id: string): Promise<void> {
  await userPacks.setValue((await userPacks.getValue()).filter((p) => p.id !== id));
  if ((await lockedPack.getValue()) === id) await lockedPack.setValue(null);
  const { [id]: _removed, ...rest } = await collection.getValue();
  await collection.setValue(rest);
  await deleteBlob(id).catch(() => {});
}
