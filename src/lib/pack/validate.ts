import {
  CONTENT_TYPES,
  GENRES,
  STATE_NAMES,
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

function isPosInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** Relative asset path inside a pack folder, or an http(s)/data URL. No parent traversal. */
function isSafeSrc(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 2048) return false;
  if (/^(https:|data:image\/|data:video\/)/.test(v)) return true;
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
    if (!isPosInt(v.frames)) errors.push(`${path}.frames: must be a positive integer`);
    if (!isPosInt(v.cols)) errors.push(`${path}.cols: must be a positive integer`);
    if (v.row !== undefined && !(Number.isInteger(v.row) && (v.row as number) >= 0))
      errors.push(`${path}.row: must be a non-negative integer`);
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
  }

  if (!isObj(input.size) || !isPosInt(input.size.w) || !isPosInt(input.size.h))
    errors.push('size: {w, h} positive integers required');

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
