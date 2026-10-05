/** Browser stand-in for the `node:crypto` calls pi-ai's OAuth flows make (aliased in wxt.config.ts). */

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class RandomBytes extends Uint8Array {
  override toString(encoding?: string): string {
    if (encoding === 'base64url') return base64url(this);
    if (encoding === 'base64') return btoa(String.fromCharCode(...this));
    return [...this].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export function randomBytes(n: number): RandomBytes {
  const out = new RandomBytes(n);
  crypto.getRandomValues(out);
  return out;
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

export default { randomBytes, randomUUID };
