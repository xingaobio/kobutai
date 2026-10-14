import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { live } from '@/lib/ui/live.svelte';
import { createCore } from './core';
import './shims/install';
import { connectSessions, type DesktopSession, type SessionsIo, type SessionsPayload } from './sessions';

const PUBLIC = resolve(import.meta.dirname, '../../public');

const spotify: DesktopSession = {
  id: 'Spotify.exe',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  albumTitle: 'A Night at the Opera',
  playing: true,
  position: 30,
  duration: 355,
  canPlay: true,
  canPause: true,
  canNext: true,
  canPrev: true,
  canSeek: true,
};

describe('core with the real packs and the real classifier', () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    // Serve public/ the way the app's origin does.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const path = decodeURIComponent(new URL(String(input)).pathname);
      try {
        return new Response(await readFile(PUBLIC + path));
      } catch {
        return new Response('not found', { status: 404 });
      }
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  test('a playing system session draws a character and reaches the overlay store', async () => {
    const core = createCore();
    let emit: (p: SessionsPayload) => void = () => {};
    const io: SessionsIo = {
      listen: async (_e, cb) => ((emit = cb), () => {}),
      invoke: vi.fn(async () => ({ sessions: [], currentId: null })),
    };
    const handle = connectSessions(core.hub, io);
    await handle.ready;

    emit({ sessions: [spotify], currentId: spotify.id });
    await core.settled();

    expect(live.registry.primary?.snapshot).toMatchObject({ site: 'open.spotify.com', title: 'Bohemian Rhapsody', adapter: 'smtc', canVolume: false });
    expect(live.draw).not.toBeNull();
    const packs = await core.catalog.all();
    expect(packs.length).toBeGreaterThan(0);
    expect(packs.some((p) => p.id === live.draw!.packId)).toBe(true);
    expect(live.draw!.tags.type).toBe('music');
    // The local model answered (not just the keyword rules).
    expect(live.draw!.tags.source).toBe('model');
    expect(live.draw!.locked).toBe(false);

    // The overlay's buttons go through core.send into the hub.
    core.send({ t: 'reroll' });
    await core.settled();
    expect(live.draw!.canReroll).toBe(false);

    // The session ends: the overlay store empties.
    emit({ sessions: [], currentId: null });
    await core.settled();
    expect(live.registry.primary).toBeNull();
    handle.stop();
    core.dispose();
  });
});
