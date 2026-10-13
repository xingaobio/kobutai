import { describe, expect, test } from 'vitest';
import { validatePack } from './validate';
import { assetFor } from './types';

const valid = {
  id: 'blob',
  name: 'Blob',
  tags: { type: ['music'], genre: ['jpop'] },
  size: { w: 192, h: 208 },
  states: {
    idle: { kind: 'sprite', src: 'idle.svg', frames: 8, cols: 8, fps: 8 },
    playing: { kind: 'video', src: 'dance.webm', loop: true },
  },
};

describe('validatePack', () => {
  test('accepts a valid pack', () => {
    expect(validatePack(valid).ok).toBe(true);
  });

  test.each([
    ['non-object', 42],
    ['missing idle', { ...valid, states: { playing: valid.states.playing } }],
    ['bad id', { ...valid, id: 'Bad ID!' }],
    ['unknown genre', { ...valid, tags: { type: [], genre: ['polka'] } }],
    ['unknown state', { ...valid, states: { ...valid.states, dancing: valid.states.playing } }],
    ['path traversal', { ...valid, states: { idle: { ...valid.states.idle, src: '../secret.png' } } }],
    ['absolute path', { ...valid, states: { idle: { ...valid.states.idle, src: '/etc/x.png' } } }],
    ['encoded traversal', { ...valid, states: { idle: { ...valid.states.idle, src: '%2e%2e/secret.png' } } }],
    ['backslash', { ...valid, states: { idle: { ...valid.states.idle, src: '..\\x.png' } } }],
    ['javascript url', { ...valid, states: { idle: { ...valid.states.idle, src: 'javascript:alert(1)' } } }],
    ['http url', { ...valid, states: { idle: { ...valid.states.idle, src: 'http://x.com/a.png' } } }],
    ['zero frames', { ...valid, states: { idle: { ...valid.states.idle, frames: 0 } } }],
    ['bad kind', { ...valid, states: { idle: { kind: 'live2d', src: 'a.moc' } } }],
    ['bad size', { ...valid, size: { w: -1, h: 10 } }],
    ['huge size', { ...valid, size: { w: 30000, h: 30000 } }],
    ['huge frame count', { ...valid, states: { idle: { ...valid.states.idle, frames: 100000 } } }],
  ])('rejects %s', (_, input) => {
    const r = validatePack(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  test('accepts https src', () => {
    const r = validatePack({ ...valid, states: { idle: { ...valid.states.idle, src: 'https://cdn.example/a.webp' } } });
    expect(r.ok).toBe(true);
  });
});

describe('assetFor', () => {
  test('falls back to idle for missing states', () => {
    const r = validatePack(valid);
    if (!r.ok) throw new Error('invalid');
    expect(assetFor(r.pack, 'paused')).toBe(r.pack.states.idle);
    expect(assetFor(r.pack, 'playing')).toBe(r.pack.states.playing);
    expect(assetFor(r.pack, 'error')).toBe(r.pack.states.idle);
  });
});

describe('per-language names', () => {
  const base = {
    id: 'x',
    name: 'X',
    tags: { type: [], genre: [] },
    size: { w: 10, h: 10 },
    states: { idle: { kind: 'sprite', src: 'a.png', frames: 1, cols: 1, fps: 1 } },
  };
  test('accepts en/ja/zh strings and rejects anything else', () => {
    expect(validatePack({ ...base, names: { en: 'X', ja: 'エックス' } }).ok).toBe(true);
    expect(validatePack({ ...base, names: { fr: 'X' } }).ok).toBe(false);
    expect(validatePack({ ...base, names: { en: 3 } }).ok).toBe(false);
  });
});
