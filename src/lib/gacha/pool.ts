import type { PackManifest } from '../pack/types';
import type { Tags } from '../tagging/types';

type PackTagsOnly = Pick<PackManifest, 'id' | 'tags'>;

const isGeneric = (p: PackTagsOnly) => p.tags.genre.length === 0 && p.tags.type.length === 0;

/**
 * Which packs can appear for content with these tags:
 * 1. music → packs of that genre (whose type list allows music);
 * 2. non-music → packs made for that content type; for a video of a known kind (vclass),
 *    the packs that list that kind are preferred when there are any;
 * 3. otherwise the generic pool (no tags), and as a last resort every pack.
 */
export function poolFor<P extends PackTagsOnly>(packs: readonly P[], tags: Pick<Tags, 'type' | 'genre' | 'vclass'>): P[] {
  const typeOk = (p: P) => p.tags.type.length === 0 || p.tags.type.includes(tags.type);
  if (tags.genre) {
    const genre = packs.filter((p) => typeOk(p) && p.tags.genre.includes(tags.genre!));
    if (genre.length) return genre;
  } else {
    const typed = packs.filter((p) => p.tags.type.includes(tags.type) && p.tags.genre.length === 0);
    const kind = tags.vclass;
    if (kind) {
      // Packs stored by older versions were never validated for this field.
      const matching = typed.filter((p) => Array.isArray(p.tags.vclass) && p.tags.vclass.includes(kind));
      if (matching.length) return matching;
    }
    if (typed.length) return typed;
  }
  const generic = packs.filter(isGeneric);
  return generic.length ? generic : [...packs];
}

/** Uniform pick; `rng` returns [0, 1). */
export function pick<T>(items: readonly T[], rng: () => number): T | undefined {
  if (!items.length) return undefined;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
}
