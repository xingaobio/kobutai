import { expect, test, vi } from 'vitest';
import { loadPackIndex } from './loader';

const pack = (id: string) => ({
  id,
  name: id,
  tags: { type: [], genre: [] },
  size: { w: 10, h: 10 },
  states: { idle: { kind: 'sprite', src: 'idle.svg', frames: 2, cols: 2, fps: 4 } },
});

test('loads valid packs, resolves src, skips invalid ones', async () => {
  const files: Record<string, unknown> = {
    'chrome-extension://x/packs/index.json': { packs: ['a', 'bad'] },
    'chrome-extension://x/packs/a/pack.json': pack('a'),
    'chrome-extension://x/packs/bad/pack.json': { id: 'bad' },
  };
  const onError = vi.fn();
  const packs = await loadPackIndex('chrome-extension://x/packs', 'builtin', async (u) => files[u], onError);
  expect(packs).toHaveLength(1);
  expect(packs[0]!.states.idle.src).toBe('chrome-extension://x/packs/a/idle.svg');
  expect(packs[0]!.source).toBe('builtin');
  expect(onError).toHaveBeenCalledWith('bad', expect.any(Array));
});

test('rejects malformed index', async () => {
  await expect(loadPackIndex('https://x/', 'remote', async () => ({}))).rejects.toThrow();
});
