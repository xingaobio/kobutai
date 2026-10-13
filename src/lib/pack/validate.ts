import {
  CONTENT_TYPES,
  GENRES,
  STATE_NAMES,
  VIDEO_CLASSES,
  type PackManifest,
  type StateAsset,
} from './types';

export type ValidationResult =
  | { ok: true; pack: PackManifest }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPosInt(v: unknown, max = Number.MAX_SAFE_INTEGER): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= max;
}

/** Upper bounds so a hostile pack can't make every tab allocate a giant canvas or loop forever. */
export const LIMITS = { size: 1024, frames: 512, cols: 64, row: 512 } as const;

/** Relative asset path inside a pack folder, or an http(s)/data URL. No parent traversal. */
function isSafeSrc(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 2048) return false;
  if (/^(https:|data:image\/|data:video\/)/.test(v)) return true;
  // Reference to an asset imported into the extension's own IndexedDB.
  if (/^hdblob:[a-z0-9][a-z0-9-_]{0,80}$/.test(v)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
  if (v.includes('\\')) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(v);
  } catch {
    return false;
  }
  // URL resolution treats %2e%2e as "..", so check the decoded form too.
  return ![v, decoded].some((p) => p.startsWith('/') || p.split('/').some((seg) => seg === '..' || seg === '.'));
}

function validateAsset(v: unknown, path: string, errors: string[]): v is StateAsset {
  if (!isObj(v)) {
    errors.push(`${path}: must be an object`);
    return false;
  }
  if (!isSafeSrc(v.src)) errors.push(`${path}.src: must be a relative path or https URL`);
  if (v.loop !== undefined && typeof v.loop !== 'boolean') errors.push(`${path}.loop: must be boolean`);
  if (v.kind === 'sprite') {
    if (!isPosInt(v.frames, LIMITS.frames)) errors.push(`${path}.frames: must be an integer in 1..${LIMITS.frames}`);
    if (!isPosInt(v.cols, LIMITS.cols)) errors.push(`${path}.cols: must be an integer in 1..${LIMITS.cols}`);
    if (v.row !== undefined && !(Number.isInteger(v.row) && (v.row as number) >= 0 && (v.row as number) <= LIMITS.row))
      errors.push(`${path}.row: must be an integer in 0..${LIMITS.row}`);
    if (typeof v.fps !== 'number' || !(v.fps > 0 && v.fps <= 60)) errors.push(`${path}.fps: must be in (0, 60]`);
  } else if (v.kind !== 'video') {
    errors.push(`${path}.kind: must be "sprite" or "video"`);
  }
  return true;
}

function validateTagList(v: unknown, allowed: readonly string[], path: string, errors: string[]) {
  if (!Array.isArray(v)) {
    errors.push(`${path}: must be an array`);
    return;
  }
  for (const t of v) if (!allowed.includes(t as string)) errors.push(`${path}: unknown tag "${String(t)}"`);
}

export function validatePack(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['pack.json must be an object'] };

  if (typeof input.id !== 'string' || !ID_RE.test(input.id)) errors.push('id: must match ' + ID_RE);
  if (typeof input.name !== 'string' || !input.name.trim()) errors.push('name: required');
  for (const k of ['author', 'license'] as const)
    if (input[k] !== undefined && typeof input[k] !== 'string') errors.push(`${k}: must be a string`);

  if (!isObj(input.tags)) errors.push('tags: required object');
  else {
    validateTagList(input.tags.type, CONTENT_TYPES, 'tags.type', errors);
    validateTagList(input.tags.genre, GENRES, 'tags.genre', errors);
    if (input.tags.vclass !== undefined) validateTagList(input.tags.vclass, VIDEO_CLASSES, 'tags.vclass', errors);
  }

  if (!isObj(input.size) || !isPosInt(input.size.w, LIMITS.size) || !isPosInt(input.size.h, LIMITS.size))
    errors.push(`size: {w, h} integers in 1..${LIMITS.size} required`);

  if (!isObj(input.states)) errors.push('states: required object');
  else {
    if (!('idle' in input.states)) errors.push('states.idle: required');
    for (const [name, asset] of Object.entries(input.states)) {
      if (!(STATE_NAMES as readonly string[]).includes(name)) {
        errors.push(`states.${name}: unknown state`);
        continue;
      }
      validateAsset(asset, `states.${name}`, errors);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, pack: input as unknown as PackManifest };
}
