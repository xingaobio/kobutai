import { bilibili } from './bilibili';
import { spotify } from './spotify';
import type { SiteAdapter } from './types';
import { youtube } from './youtube';
import { ytmusic } from './ytmusic';

export const ADAPTERS: readonly SiteAdapter[] = [ytmusic, youtube, bilibili, spotify];

export function adapterFor(host: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.match(host)) ?? null;
}

export type { SiteAdapter } from './types';
