import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { Classifier, Model, durBucket, featureIndices, norm, normSource, type ModelConfig } from './classifier';

/** Tests run from the repository root. */
const root = (p: string) => resolve(process.cwd(), p);
const bin = readFileSync(root('public/model/kobutai.bin'));
const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
const config = JSON.parse(readFileSync(root('public/model/config.json'), 'utf8')) as ModelConfig;
const clf = Classifier.load(config, buf, readFileSync(root('public/model/artists.tsv'), 'utf8'));

interface Vector {
  input: {
    title: string;
    artist: string;
    source: string;
    duration: number | null;
    isLive: boolean;
    platformCategory: 'music' | 'podcast' | null;
  };
  featureHash: number;
  expected: Record<string, unknown> & {
    typeConfidence: number;
    genreConfidence: number;
    vclassConfidence: number;
  };
}
const vectors = JSON.parse(readFileSync(root('tests/fixtures/model-vectors.json'), 'utf8')) as {
  buckets: number;
  cases: Vector[];
};

describe('matches the reference implementation exactly', () => {
  test(`${vectors.cases.length} cases from kobutai-classifier/model/test-vectors.json`, () => {
    expect(vectors.cases.length).toBeGreaterThan(500);
    const bad: string[] = [];
    for (const v of vectors.cases) {
      const i = v.input;
      const r = clf.classify(i);
      const e = v.expected;
      const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
      const same =
        r.type === e.type &&
        r.genre === e.genre &&
        r.vclass === e.vclass &&
        r.typeVia === e.typeVia &&
        r.genreVia === e.genreVia &&
        close(r.typeConfidence, e.typeConfidence) &&
        close(r.genreConfidence, e.genreConfidence) &&
        close(r.vclassConfidence, e.vclassConfidence);
      const idx = featureIndices(
        norm(i.title),
        norm(i.artist),
        normSource(i.source),
        durBucket(i.isLive ? -1 : i.duration),
        vectors.buckets,
      );
      let h = 0;
      for (const x of idx) h = (Math.imul(h, 31) + x) >>> 0;
      if (!same || h !== v.featureHash) bad.push(`${JSON.stringify(i)} → ${JSON.stringify(r)}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});

describe('text normalisation', () => {
  test('full-width, accents and case', () => {
    expect(norm('ＹＯＡＳＯＢＩ　Beyoncé')).toBe('yoasobi beyonce');
    expect(norm('Ëlka')).toBe('elka');
    expect(norm(undefined)).toBe('');
  });
  test('only ASCII letters are lower-cased (matches the other runtimes)', () => {
    expect(norm('ДЖ')).toBe('ДЖ');
  });
  test('source prefixes', () => {
    expect(normSource('WWW.YouTube.com')).toBe('youtube.com');
    expect(normSource('m.bilibili.com')).toBe('bilibili.com');
  });
  test('duration buckets', () => {
    expect([undefined, 0, NaN, -1, Infinity, 30, 200, 4000].map((d) => durBucket(d))).toEqual(['U', 'U', 'U', 'L', 'L', 'a', 'c', 'g']);
  });
});

describe('model file', () => {
  test('rejects a file that is not a model', () => {
    expect(() => new Model(new ArrayBuffer(8))).toThrow();
    expect(() => new Model(new TextEncoder().encode('NOPE0000000000000000').buffer)).toThrow(/unsupported/);
  });
  test('rejects a truncated model', () => {
    expect(() => new Model(buf.slice(0, buf.byteLength - 10))).toThrow(/size/);
  });
});

describe('pipeline behaviour', () => {
  test('music sites are music by rule', () => {
    expect(clf.classify({ title: 'Anything at all', source: 'music.youtube.com' })).toMatchObject({ type: 'music', typeVia: 'rule' });
  });
  test('podcast sites are podcasts by rule; platform category overrides the model', () => {
    expect(clf.classify({ title: 'Episode 12', source: 'podcasts.apple.com' })).toMatchObject({ type: 'podcast', typeVia: 'rule' });
    expect(clf.classify({ title: 'Why is everyone wearing Crocs?', source: 'open.spotify.com', platformCategory: 'podcast' })).toMatchObject({
      type: 'podcast',
    });
  });
  test('film and course sites can only be video', () => {
    expect(clf.classify({ title: 'Ludwig van Beethoven - Symphony No. 5', source: 'www.netflix.com' }).type).toBe('video');
  });
  test('the artist table decides the genre for a known artist', () => {
    expect(clf.classify({ title: '晴天', artist: '周杰倫', source: 'music.163.com' })).toMatchObject({ genre: 'cpop', genreVia: 'table' });
  });
  test('genre and video class are only set for their type', () => {
    const v = clf.classify({ title: 'I Spent 7 Days Buried Alive', artist: 'MrBeast', source: 'www.youtube.com', duration: 1124 });
    expect(v.type).toBe('video');
    expect(v.genre).toBeNull();
    const m = clf.classify({ title: 'Lose Yourself', artist: 'Eminem', source: 'open.spotify.com' });
    expect(m.vclass).toBeNull();
  });
  test('empty input does not throw', () => {
    expect(() => clf.classify({})).not.toThrow();
  });
});
