import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { removeFromCollection, restorePacks } from '../importer';
import { collection, lockedPack, removedPacks, userPacks } from '../settings';
import { splitRemoved } from './catalog';
import type { LoadedPack } from './types';

beforeEach(() => fakeBrowser.reset());

const pack = (id: string, source: LoadedPack['source']) => ({ id, source }) as LoadedPack;

test('splitRemoved: deleted ids leave the catalog but stay restorable; unknown ids are ignored', () => {
  const packs = [pack('rina', 'builtin'), pack('kiki', 'builtin'), pack('dj', 'remote')];
  const { kept, removed } = splitRemoved(packs, ['kiki', 'gone-with-its-library']);
  expect(kept.map((p) => p.id)).toEqual(['rina', 'dj']);
  expect(removed.map((p) => p.id)).toEqual(['kiki']);
  expect(splitRemoved(packs, []).kept).toHaveLength(3);
});

describe('deleting from the 图鉴', () => {
  test('a built-in or library character is taken out, unlocked, and comes back with its record', async () => {
    await collection.setValue({ rina: { n: 3, first: 1 }, dj: { n: 1, first: 2 } });
    await lockedPack.setValue('rina');
    await removeFromCollection(pack('rina', 'builtin'));
    await removeFromCollection(pack('rina', 'builtin'));
    await removeFromCollection(pack('dj', 'remote'));
    expect(await removedPacks.getValue()).toEqual(['rina', 'dj']);
    expect(await lockedPack.getValue()).toBeNull();
    // The record is kept for the day it is restored.
    expect((await collection.getValue()).rina).toEqual({ n: 3, first: 1 });

    await restorePacks(['rina']);
    expect(await removedPacks.getValue()).toEqual(['dj']);
    await restorePacks();
    expect(await removedPacks.getValue()).toEqual([]);
  });

  test('an imported character is erased for good', async () => {
    await userPacks.setValue([pack('petdex-miku', 'petdex'), pack('petdex-neko', 'petdex')]);
    await collection.setValue({ 'petdex-miku': { n: 2, first: 1 } });
    await removeFromCollection(pack('petdex-miku', 'petdex'));
    expect((await userPacks.getValue()).map((p) => p.id)).toEqual(['petdex-neko']);
    expect(await collection.getValue()).toEqual({});
    expect(await removedPacks.getValue()).toEqual([]);
  });
});
