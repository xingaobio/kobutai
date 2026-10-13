/**
 * On-device media classifier (hashed character n-grams + three linear heads, int8).
 *
 * A port of the reference implementation in the kobutai-classifier project
 * (kobutai_py/core.py, spec/SPEC.md). Every change here must keep
 * tests/fixtures/model-vectors.json passing exactly: the same model file is
 * meant to give identical answers in the extension and the desktop apps.
 */

export const MODEL_TYPES = ['music', 'video', 'live', 'podcast'] as const;
export const MODEL_GENRES = [
  'rock',
  'western-pop',
  'jpop',
  'anime',
  'cpop',
  'electronic',
  'lofi',
  'classical',
  'hiphop',
  'other',
] as const;
export const MODEL_VCLASSES = ['ent', 'info'] as const;
export type ModelType = (typeof MODEL_TYPES)[number];
export type ModelGenre = (typeof MODEL_GENRES)[number];
export type ModelVClass = (typeof MODEL_VCLASSES)[number];

export interface ModelInput {
  title?: string;
  /** Artist, or channel / uploader name. */
  artist?: string;
  /** Host name ("www.youtube.com") or desktop app id ("Spotify.exe"). */
  source?: string;
  /** Seconds. Missing, 0 or NaN = unknown; Infinity or negative = live. */
  duration?: number | null;
  isLive?: boolean;
  /** Set when the platform itself says what this is (e.g. a podcast URL). */
  platformCategory?: 'music' | 'podcast' | null;
}

export interface Classification {
  /** null = not confident: use the generic pool. */
  type: ModelType | null;
  typeConfidence: number;
  typeVia: 'rule' | 'model';
  genre: ModelGenre | null;
  genreConfidence: number;
  genreVia: 'table' | 'model' | null;
  vclass: ModelVClass | null;
  vclassConfidence: number;
}

export interface ModelConfig {
  thresholds: { type: number; genre: number; vclass: number };
  artistBonus: { artist: number; title: number };
  rules: { musicSources: string[]; podcastSources: string[]; videoSources: string[] };
  sourceAliases: Record<string, string>;
}

// ------------------------------------------------------------------ text

function collapse(s: string): string {
  return s
    .split(' ')
    .filter((p) => p.length > 0)
    .join(' ');
}

/** NFKD, drop U+0300–U+036F, ASCII-only lowercase, whitespace collapse. */
export function norm(s: string | null | undefined): string {
  if (!s) return '';
  let out = '';
  for (const ch of s.normalize('NFKD')) {
    const o = ch.codePointAt(0) ?? 0;
    if (o >= 0x300 && o <= 0x36f) continue;
    if (o >= 0x41 && o <= 0x5a) out += String.fromCharCode(o + 32);
    else if (o === 9 || o === 10 || o === 11 || o === 12 || o === 13 || o === 0xa0 || o === 0x3000) out += ' ';
    else out += ch;
  }
  return collapse(out);
}

export function normSource(s: string | null | undefined): string {
  let r = norm(s);
  for (const p of ['www.', 'm.']) if (r.startsWith(p)) r = r.slice(p.length);
  return r;
}

export function durBucket(d: number | null | undefined): string {
  if (d === null || d === undefined || Number.isNaN(d) || d === 0) return 'U';
  if (d < 0 || d === Infinity) return 'L';
  if (d < 60) return 'a';
  if (d < 150) return 'b';
  if (d < 330) return 'c';
  if (d < 600) return 'd';
  if (d < 1500) return 'e';
  if (d < 3600) return 'f';
  return 'g';
}

const encoder = new TextEncoder();

/** 32-bit FNV-1a over UTF-8. */
export function fnv1a(str: string): number {
  const data = encoder.encode(str);
  let h = 0x811c9dc5;
  for (const b of data) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function words(cps: readonly string[]): string[] {
  const out: string[] = [];
  let cur = '';
  for (const c of cps) {
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) cur += c;
    else if (cur) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  return out;
}

const MAX_CHARS = 160;

export function featureStrings(title: string, artist: string, source: string, bucket: string): string[] {
  const feats: string[] = [];
  for (const [tag, text] of [
    ['t', title],
    ['a', artist],
  ] as const) {
    const cps = Array.from(text).slice(0, MAX_CHARS);
    const seq = ['^', ...cps, '$'];
    for (let n = 1; n <= 4; n++) {
      for (let i = 0; i + n <= seq.length; i++) {
        const g = seq.slice(i, i + n).join('');
        feats.push(tag + n + ':' + g);
        if (n >= 2) feats.push('x' + n + ':' + g);
      }
    }
    const ws = words(cps);
    for (const w of ws) {
      feats.push(tag + 'w:' + w);
      feats.push('xw:' + w);
    }
    for (let i = 0; i + 1 < ws.length; i++) feats.push(tag + 'b:' + ws[i] + ' ' + ws[i + 1]);
  }
  feats.push('s:' + source);
  feats.push('d:' + bucket);
  feats.push('sd:' + source + '|' + bucket);
  return feats;
}

export function featureIndices(title: string, artist: string, source: string, bucket: string, buckets: number): number[] {
  const mask = buckets - 1;
  const set = new Set<number>();
  for (const f of featureStrings(title, artist, source, bucket)) set.add(fnv1a(f) & mask);
  return Array.from(set).sort((a, b) => a - b);
}

// ------------------------------------------------------------------ model

interface Head {
  k: number;
  scale: number;
  bias: Float32Array;
}

export class Model {
  readonly buckets: number;
  private readonly heads: Head[] = [];
  private readonly total: number;
  private readonly w: Int8Array;

  constructor(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    if (buf.byteLength < 16) throw new Error('model file too small');
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'KBT1' || dv.getUint32(4, true) !== 1) throw new Error('unsupported model file');
    this.buckets = dv.getUint32(8, true);
    const nheads = dv.getUint32(12, true);
    let off = 16;
    let total = 0;
    for (let h = 0; h < nheads; h++) {
      const k = dv.getUint32(off, true);
      const scale = dv.getFloat32(off + 4, true);
      const bias = new Float32Array(k);
      for (let j = 0; j < k; j++) bias[j] = dv.getFloat32(off + 8 + 4 * j, true);
      off += 8 + 4 * k;
      this.heads.push({ k, scale, bias });
      total += k;
    }
    this.total = total;
    if (off + this.buckets * total !== buf.byteLength) throw new Error('model file has the wrong size');
    this.w = new Int8Array(buf, off, this.buckets * total);
  }

  logits(idx: readonly number[]): number[][] {
    const total = this.total;
    const sums = new Array<number>(total).fill(0);
    const w = this.w;
    for (const i of idx) {
      const base = i * total;
      for (let k = 0; k < total; k++) sums[k]! += w[base + k]!;
    }
    const inv = 1.0 / Math.sqrt(idx.length);
    const out: number[][] = [];
    let off = 0;
    for (const h of this.heads) {
      const z: number[] = [];
      for (let j = 0; j < h.k; j++) z.push(h.bias[j]! + h.scale * sums[off + j]! * inv);
      out.push(z);
      off += h.k;
    }
    return out;
  }
}

export function softmax(z: readonly number[], allowed?: readonly boolean[]): number[] {
  let m = -Infinity;
  for (let j = 0; j < z.length; j++) if ((!allowed || allowed[j]) && z[j]! > m) m = z[j]!;
  const e = z.map((v, j) => (!allowed || allowed[j] ? Math.exp(v - m) : 0));
  let s = 0;
  for (const v of e) s += v;
  return e.map((v) => v / s);
}

function argmax(p: readonly number[]): number {
  let best = 0;
  for (let j = 1; j < p.length; j++) if (p[j]! > p[best]!) best = j;
  return best;
}

// ------------------------------------------------------------------ artists

const SEPARATORS = new Set(Array.from('-–—|｜/／「」『』【】()（）[]《》〈〉<>,、，&×·・:：;；"“”\'‘’~〜～!！?？#@*+=。'));
const CUTS = [' feat', ' ft ', ' ft.', ' x '];

export function titleSegments(t: string): string[] {
  const segs: string[] = [];
  let cur = '';
  for (const c of t) {
    if (SEPARATORS.has(c)) {
      segs.push(cur);
      cur = '';
    } else cur += c;
  }
  segs.push(cur);
  const out: string[] = [];
  for (const raw of segs) {
    const s = collapse(raw);
    for (const cut of CUTS) {
      const p = s.indexOf(cut);
      if (p > 0) out.push(s.slice(0, p).trim());
    }
    if (s) out.push(s);
  }
  return out;
}

export class ArtistTable {
  private readonly map = new Map<string, number>();

  /** Lines of "normalised key<TAB>genre index". */
  constructor(text: string) {
    for (const line of text.split('\n')) {
      const tab = line.lastIndexOf('\t');
      if (tab <= 0) continue;
      const g = Number(line.slice(tab + 1));
      if (Number.isInteger(g) && g >= 0 && g < MODEL_GENRES.length) this.map.set(line.slice(0, tab), g);
    }
  }

  get size(): number {
    return this.map.size;
  }

  lookup(artist: string, title: string): { genre: number; where: 'artist' | 'title' } | null {
    if (artist) {
      const g = this.map.get(artist);
      if (g !== undefined) return { genre: g, where: 'artist' };
      for (const seg of titleSegments(artist)) {
        const g2 = this.map.get(seg);
        if (g2 !== undefined) return { genre: g2, where: 'artist' };
      }
    }
    for (const seg of titleSegments(title)) {
      const g = this.map.get(seg);
      if (g !== undefined) return { genre: g, where: 'title' };
    }
    return null;
  }
}

// ------------------------------------------------------------------ pipeline

export class Classifier {
  private readonly music: Set<string>;
  private readonly podcast: Set<string>;
  private readonly video: Set<string>;

  constructor(
    private readonly cfg: ModelConfig,
    private readonly model: Model,
    private readonly artists: ArtistTable,
  ) {
    this.music = new Set(cfg.rules.musicSources);
    this.podcast = new Set(cfg.rules.podcastSources);
    this.video = new Set(cfg.rules.videoSources);
  }

  static load(config: ModelConfig, modelBin: ArrayBuffer, artistsTsv: string): Classifier {
    return new Classifier(config, new Model(modelBin), new ArtistTable(artistsTsv));
  }

  classify(input: ModelInput): Classification {
    const cfg = this.cfg;
    const t = norm(input.title);
    const a = norm(input.artist);
    let s = normSource(input.source);
    if (Object.prototype.hasOwnProperty.call(cfg.sourceAliases, s)) s = cfg.sourceAliases[s] ?? s;
    const b = durBucket(input.isLive ? -1 : input.duration);
    const [zType = [], zGenre = [], zVclass = []] = this.model.logits(featureIndices(t, a, s, b, this.model.buckets));

    let allowed: boolean[] | undefined;
    let forced = -1;
    if (input.platformCategory === 'music' || this.music.has(s)) forced = 0;
    else if (input.platformCategory === 'podcast' || this.podcast.has(s)) forced = 3;
    else if (this.video.has(s)) allowed = [false, true, false, false];
    else if (b === 'L') allowed = [true, false, true, false];

    let ti: number;
    let tconf: number;
    let typeVia: Classification['typeVia'] = 'model';
    if (forced >= 0) {
      ti = forced;
      tconf = 1;
      typeVia = 'rule';
    } else {
      const p = softmax(zType, allowed);
      ti = argmax(p);
      tconf = p[ti]!;
    }
    const res: Classification = {
      type: MODEL_TYPES[ti] ?? null,
      typeConfidence: tconf,
      typeVia,
      genre: null,
      genreConfidence: 0,
      genreVia: null,
      vclass: null,
      vclassConfidence: 0,
    };
    const th = cfg.thresholds;
    if (tconf < th.type) {
      res.type = null;
    } else if (ti === 0) {
      const hit = this.artists.lookup(a, t);
      const zg = zGenre.slice();
      if (hit) zg[hit.genre] = (zg[hit.genre] ?? 0) + cfg.artistBonus[hit.where];
      const p = softmax(zg);
      const gi = argmax(p);
      res.genreConfidence = p[gi]!;
      if (p[gi]! >= th.genre) {
        res.genre = MODEL_GENRES[gi] ?? null;
        res.genreVia = hit && hit.genre === gi ? 'table' : 'model';
      }
    } else if (ti === 1) {
      const p = softmax(zVclass);
      const vi = argmax(p);
      res.vclassConfidence = p[vi]!;
      if (p[vi]! >= th.vclass) res.vclass = MODEL_VCLASSES[vi] ?? null;
    }
    return res;
  }
}
