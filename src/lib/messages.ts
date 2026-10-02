import type { MediaCommand, MediaSnapshot } from './media/types';
import type { RegistryState } from './registry';

export const PORT_NAME = 'happydesk';

/** Content script (any frame) → background. */
export type ToBackground =
  | { t: 'snapshot'; snap: MediaSnapshot | null }
  /** Command for a registry entry; `key` omitted = primary. */
  | { t: 'command'; key?: string; cmd: MediaCommand }
  | { t: 'select'; key: string };

/** Background → content script. */
export type ToContent =
  | { t: 'command'; cmd: MediaCommand }
  /** Only sent to top frames, which host the overlay. */
  | { t: 'state'; state: RegistryState };

/** One-off runtime messages (popup ↔ content). */
export type RuntimeRequest = { t: 'site-info' } | { t: 'set-site-hidden'; hidden: boolean };
export type SiteInfo = { host: string; hidden: boolean };
