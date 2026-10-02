import type { LoadedPack, SpriteAsset, StateName } from './pack/types';

/**
 * Petdex / Codex pet format: `pet.json` + one spritesheet, 8 columns × 9 rows
 * of 192×208 cells (v2 sheets have 11 rows). Rows are fixed animation states.
 */
export const PETDEX_MANIFEST_URL = 'https://assets.petdex.dev/manifests/petdex-v1.json';
export const PETDEX_ORIGIN = 'https://assets.petdex.dev/*';
export const PETDEX_COLS = 8;
export const PETDEX_CELL = { w: 192, h: 208 } as const;
export const PETDEX_ROWS = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
] as const;

/** Petdex row → HappyDesk state. One-shot states don't loop. */
const STATE_ROWS: Record<StateName, { row: (typeof PETDEX_ROWS)[number]; loop: boolean; fps: number }> = {
  idle: { row: 'idle', loop: true, fps: 6 },
  playing: { row: 'running', loop: true, fps: 10 },
  paused: { row: 'waiting', loop: true, fps: 6 },
  appear: { row: 'waving', loop: false, fps: 8 },
  click: { row: 'jumping', loop: false, fps: 10 },
  error: { row: 'failed', loop: true, fps: 6 },
};

export interface PetdexEntry {
  slug: string;
  displayName: string;
  kind?: string;
  submittedBy?: string;
  spritesheetUrl: string;
  petJsonUrl?: string;
}

const isHttps = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//.test(u);

export function parseManifest(json: unknown): PetdexEntry[] {
  const pets = (json as { pets?: unknown })?.pets;
  if (!Array.isArray(pets)) throw new Error('Petdex manifest: "pets" missing');
  const out: PetdexEntry[] = [];
  for (const p of pets as Record<string, unknown>[]) {
    if (typeof p?.slug !== 'string' || !isHttps(p.spritesheetUrl)) continue;
    out.push({
      slug: p.slug,
      displayName: typeof p.displayName === 'string' && p.displayName ? p.displayName : p.slug,
      kind: typeof p.kind === 'string' ? p.kind : undefined,
      submittedBy: typeof p.submittedBy === 'string' ? p.submittedBy : undefined,
      spritesheetUrl: p.spritesheetUrl,
      petJsonUrl: isHttps(p.petJsonUrl) ? p.petJsonUrl : undefined,
    });
  }
  return out;
}

export function searchPets(pets: readonly PetdexEntry[], q: string, limit = 30): PetdexEntry[] {
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? pets.filter((p) => p.slug.toLowerCase().includes(needle) || p.displayName.toLowerCase().includes(needle))
    : pets;
  return hits.slice(0, limit);
}

/** Sheet geometry from pixel size; rejects images that aren't a Petdex grid. */
export function gridFor(width: number, height: number): { cellW: number; cellH: number; rows: number } {
  const cellW = width / PETDEX_COLS;
  const cellH = (cellW * PETDEX_CELL.h) / PETDEX_CELL.w;
  const rows = Math.round(height / cellH);
  if (!Number.isFinite(rows) || rows < PETDEX_ROWS.length || Math.abs(rows * cellH - height) > cellH * 0.05)
    throw new Error(`不是 Petdex 精灵图：${width}×${height}（需要 8 列 × 9 行，每格 192×208 比例）`);
  return { cellW, cellH, rows };
}

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA bytes, row-major. */
  data: Uint8ClampedArray;
}

/** Frames used in each row: cells up to the last one containing visible pixels. */
export function countFrames(img: PixelSource): number[] {
  const { cellW, cellH } = gridFor(img.width, img.height);
  const step = Math.max(1, Math.floor(cellW / 24));
  const visible = (cx: number, cy: number) => {
    const x0 = Math.floor(cx * cellW);
    const y0 = Math.floor(cy * cellH);
    for (let y = y0; y < Math.min(img.height, y0 + cellH); y += step)
      for (let x = x0; x < Math.min(img.width, x0 + cellW); x += step)
        if (img.data[(y * img.width + x) * 4 + 3]! > 8) return true;
    return false;
  };
  return PETDEX_ROWS.map((_, row) => {
    let last = 0;
    for (let col = 0; col < PETDEX_COLS; col++) if (visible(col, row)) last = col + 1;
    return Math.max(1, last);
  });
}

export function safeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'pet';
}

/** Build a HappyDesk pack from a Petdex sheet. Petdex pets join the generic pool. */
export function toPack(
  meta: { slug: string; displayName: string; submittedBy?: string },
  spriteSrc: string,
  frames: readonly number[],
): LoadedPack {
  const states = {} as Record<StateName, SpriteAsset>;
  for (const [state, cfg] of Object.entries(STATE_ROWS) as [StateName, (typeof STATE_ROWS)[StateName]][]) {
    const row = PETDEX_ROWS.indexOf(cfg.row);
    states[state] = {
      kind: 'sprite',
      src: spriteSrc,
      frames: frames[row] ?? PETDEX_COLS,
      cols: PETDEX_COLS,
      row,
      fps: cfg.fps,
      ...(cfg.loop ? {} : { loop: false }),
    };
  }
  return {
    id: `petdex-${safeSlug(meta.slug)}`,
    name: meta.displayName,
    author: meta.submittedBy ? `${meta.submittedBy} (Petdex)` : 'Petdex',
    license: '归投稿者所有，仅供个人使用（Petdex）',
    tags: { type: [], genre: [] },
    size: { ...PETDEX_CELL },
    states,
    source: 'petdex',
  };
}
